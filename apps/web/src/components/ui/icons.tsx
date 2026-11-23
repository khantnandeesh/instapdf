/** Our own 24x24 line icons (1.75 stroke, currentColor). Decorative: aria-hidden. */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export type IconComponent = (props: IconProps) => React.ReactElement;

export const FileIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);
export const FilesIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M9 7V5a2 2 0 0 1 2-2h5l4 4v10a2 2 0 0 1-2 2h-2" />
    <rect x="4" y="7" width="11" height="14" rx="2" />
  </Icon>
);
export const PlusIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const MinusIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);
export const RotateLeftIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M4 4v5h5" />
    <path d="M4.6 9A8 8 0 1 1 6 16.5" />
  </Icon>
);
export const RotateRightIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M20 4v5h-5" />
    <path d="M19.4 9A8 8 0 1 0 18 16.5" />
  </Icon>
);
export const ResetIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);
export const CloseIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const EyeIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const LockIcon: IconComponent = (p) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);
export const CheckIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const DownloadIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);
export const ShareIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
  </Icon>
);
export const AlertIcon: IconComponent = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </Icon>
);
export const InfoIcon: IconComponent = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </Icon>
);
export const EnlargeIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </Icon>
);
export const ChevronLeftIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
);
export const ChevronRightIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);
export const ShieldIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
export const SearchIcon: IconComponent = (p) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </Icon>
);
export const GridIcon: IconComponent = (p) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);
export const ChevronDownIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="m5 9 7 7 7-7" />
  </Icon>
);
export const ClockIcon: IconComponent = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
/** A laptop: "runs on your device". */
export const DeviceIcon: IconComponent = (p) => (
  <Icon {...p}>
    <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
    <path d="M2.5 19h19" />
  </Icon>
);
export const ArrowRightIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M4.5 12h15" />
    <path d="m13 5.5 6.5 6.5-6.5 6.5" />
  </Icon>
);
export const ArrowLeftIcon: IconComponent = (p) => (
  <Icon {...p}>
    <path d="M19.5 12h-15" />
    <path d="m11 5.5-6.5 6.5 6.5 6.5" />
  </Icon>
);
