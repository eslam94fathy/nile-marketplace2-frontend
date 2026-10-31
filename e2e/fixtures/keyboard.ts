import type { Locator, Page } from '@playwright/test';
import { expect } from './index';

// Keyboard-only driving for the T-I2 walkthroughs: focus moves with Tab / Shift+Tab, controls work with
// Enter, Space, arrows and Escape, text is typed. No mouse clicks: a step that can only be done by pointer
// fails here (CLAUDE.md §7: keyboard-complete).

/** More Tab presses than any of our screens needs to reach a control. */
const MAX_TABS = 80;

const isFocused = (target: Locator) =>
  target.evaluate(
    (element) => element === document.activeElement || element.contains(document.activeElement),
  );

/** Presses Tab (or Shift+Tab) until `target` has focus; fails when it can't be reached by keyboard. */
export async function tabTo(page: Page, target: Locator, { backwards = false } = {}): Promise<void> {
  await expect(target).toBeVisible();
  for (let presses = 0; presses < MAX_TABS; presses += 1) {
    if (await isFocused(target)) return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Not reachable by keyboard: ${target.toString()}`);
}

/** Tab to a button or link and press Enter. */
export async function press(page: Page, target: Locator): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press('Enter');
}

/** Tab to a text field and type into it (after clearing it with the keyboard). */
export async function type(page: Page, field: Locator, text: string): Promise<void> {
  await tabTo(page, field);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

/** Tab to a checkbox or switch and toggle it with Space. */
export async function toggle(page: Page, control: Locator): Promise<void> {
  await tabTo(page, control);
  await page.keyboard.press('Space');
}

/**
 * A Radix Select: Tab to its trigger, open it with Enter, move with ArrowDown until `option` is the active
 * item, choose it with Enter.
 */
export async function choose(page: Page, trigger: Locator, option: string | RegExp): Promise<void> {
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  const wanted = page.getByRole('option', { name: option });
  await expect(wanted.first()).toBeVisible();
  for (let moves = 0; moves < MAX_TABS; moves += 1) {
    if (await isFocused(wanted.first())) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText(option);
}

/**
 * A file input left in the tab order (`UploadTiles`): Tab to it, open the browser's picker with Space and choose
 * the file there (Playwright answers the native dialog).
 */
export async function pickFile(
  page: Page,
  input: Locator,
  file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer },
): Promise<void> {
  await tabTo(page, input);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Space')]);
  await chooser.setFiles(file);
}

/**
 * A Radix dropdown menu: Tab to its trigger, open it with Enter, move with ArrowDown until `item` is the active
 * item, choose it with Enter.
 */
export async function menu(page: Page, trigger: Locator, item: string | RegExp): Promise<void> {
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  const wanted = page.getByRole('menuitem', { name: item });
  await expect(wanted).toBeVisible();
  for (let moves = 0; moves < MAX_TABS; moves += 1) {
    if (await isFocused(wanted)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(wanted).toBeFocused();
  await page.keyboard.press('Enter');
}

/** The first option of a Radix Select that isn't disabled. */
export async function chooseFirst(page: Page, trigger: Locator): Promise<void> {
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option').first()).toBeVisible();
  // Radix focuses the first enabled item when opened from the keyboard.
  await page.keyboard.press('Enter');
}

/** A radio group: Tab into it (focus lands on the checked or first radio), then arrows until `radio` is checked. */
export async function check(page: Page, group: Locator, radio: Locator): Promise<void> {
  // Counted only once the group is on screen: right after a navigation it can still have no radios.
  await tabTo(page, group);
  await expect(radio).toBeAttached();
  const count = await group.getByRole('radio').count();
  for (let moves = 0; moves < count; moves += 1) {
    if (await radio.isChecked()) return;
    await page.keyboard.press('ArrowDown');
  }
  await expect(radio).toBeChecked();
}
