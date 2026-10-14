// Seller status banner (spec 02 §2.2).
export const PROFILE_COPY = {
  banners: {
    pending_approval: "Your account is waiting for approval. You can add products once you're approved.",
    rejected: (reason: string | null) =>
      reason === null
        ? 'Your application was rejected. Update your profile and re-apply.'
        : `Your application was rejected: ${reason}. Update your profile and re-apply.`,
    suspended:
      'Your account is suspended. Your products are hidden from the store. Please finish your open orders.',
  },
  updateProfile: 'Update your profile',
} as const;
