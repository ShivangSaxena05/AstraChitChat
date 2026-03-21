# Profile Menu Implementation Plan
Status: Planning

## Information Gathered
- No top-right profile menu in profile/[userId].tsx or PostCard.tsx
- HamburgerMenu.tsx exists (global: Settings, account switch)
- TopHeaderComponent.tsx has account switcher (no profile options)
- Need new top-right menu for profile screen

## Plan
1. [x] Create `components/ProfileMenu.tsx`: Bottom sheet modal with Settings, Archive, Saved, Close Friends, Activity Log
2. [x] Add menu button to profile/[userId].tsx header (Ionicons ellipsis-vertical + toggleMenu state)
3. [x] Integrate ProfileMenu component with visible/onClose props
4. [x] UI: Matches HamburgerMenu (slide modal, themed, icons)

Status: Complete ✅

Test: Tap top-right dots on profile → menu slides up with 5 options (Settings navigates, others log).



## Dependent Files
- profile/[userId].tsx: Add menu trigger
- New ProfileMenu.tsx

## Followup
- Test menu open/close, nav to settings

