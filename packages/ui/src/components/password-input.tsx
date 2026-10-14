'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { controlClasses } from './input';

/**
 * Password field with a show/hide toggle (conventions §5). The value is never trimmed or changed here.
 * The toggle is a real button (`aria-pressed`) after the input, so keyboard users reach it with Tab.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="off"
        className={cn(controlClasses, 'h-10 pe-11', className)}
        {...props}
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={UI_COPY.showPassword}
        onClick={() => {
          setVisible((value) => !value);
        }}
        className="absolute inset-y-0 end-0 inline-flex w-10 items-center justify-center rounded-e-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
