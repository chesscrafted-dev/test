# UI/UX Improvement Plan

## 1. Visual Feedback & Smoothness
- [ ] **Skeleton Loaders**: Add shimmer effects while loading "Recent Chats" and "Message History".
- [ ] **Message Delivery States**: Show a "sending" vs "sent" icon (checkmark) for outgoing messages.
- [ ] **Scroll UX**: Add a "New Message" anchor/button that appears when the user is scrolled up and a new message arrives.

## 2. Profile & Identity
- [ ] **Avatar Management**: Add an upload button in the `Profile` component to actually use the Cloudinary upload route for profile pictures.
- [ ] **Identity Cards**: Show a more detailed profile (Bio, Gender) when clicking on a user's name in the chat header.

## 3. Onboarding & Security Education
- [ ] **Shared Secret Tooltip**: Add a "How it works?" info bubble next to the "Shared Secret" input to explain that it's for E2EE and never sent to the server.
- [ ] **Empty State Illustrations**: Replace the plain text "Select a user" with a more welcoming, branded illustration/icon set.

## 4. Calling UX
- [ ] **Audio Feedback**: Add a "ringing" sound effect for both outgoing and incoming calls.
- [ ] **Call Quality Indicator**: Add a simple "Secure P2P" badge or info during the call to reassure the user.

## 5. Micro-interactions
- [ ] **Haptic Feedback**: (Mobile only) Add subtle vibrations for sent/received messages if supported.
- [ ] **Hover Effects**: Refine all sidebar items and buttons with consistent scale/depth transitions.

## 6. Accessibility
- [ ] **Keyboard Nav**: Ensure the entire app can be navigated via Tab + Enter.
- [ ] **ARIA Labels**: Add descriptive labels for the icon-only buttons (Call, Theme, Attach).
