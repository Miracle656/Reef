/** Compact icon set for the messages UI (Feather-style strokes). */

type P = { className?: string };
const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const base = "h-[18px] w-[18px]";

export const SendIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
);
export const SearchIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const PlusIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14" /></svg>
);
export const BackIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
);
export const CheckIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M20 6 9 17l-5-5" /></svg>
);
export const CheckCheckIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M18 6 7 17l-3-3" /><path d="m22 8-9.5 9.5" /></svg>
);
export const ImageIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>
);
export const PaperclipIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M21 11.5 12 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8.5-8.5" /></svg>
);
export const SmileIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
);
export const MoreIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
export const ReplyIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
);
export const ForwardIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="m15 17 5-5-5-5" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></svg>
);
export const TrashIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
);
export const EditIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
export const XIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const UsersIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.5-4.3-4-4.8" /></svg>
);
export const LockIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const PinIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3-1-6z" /></svg>
);
export const EyeIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const MicIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
);
export const PollIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M3 21h18M7 21V10M12 21V4M17 21v-7" /></svg>
);
export const MapPinIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>
);
export const TargetIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>
);
export const BellOffIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M8.7 3.5A6 6 0 0 1 18 8c0 3 .8 5 2 6M6 8c0 3-1 5-2 6h13M10 20a2 2 0 0 0 4 0M3 3l18 18" /></svg>
);
export const MessageIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /></svg>
);
export const FileIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5" /></svg>
);
export const WaveIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...s}><path d="M18 11V6a1.5 1.5 0 0 0-3 0M15 11V4.5a1.5 1.5 0 0 0-3 0V11M12 11V6a1.5 1.5 0 0 0-3 0v8" /><path d="M9 12.5 7.5 11A1.6 1.6 0 0 0 5 13l2 3.5A7 7 0 0 0 18 15v-4a1.5 1.5 0 0 0-3 0" /></svg>
);
