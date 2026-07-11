"use client";

import Switch, { type SwitchProps } from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";

const switchSx = {
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: "var(--color-primary-action)",
  },
  "& .MuiSwitch-switchBase.Mui-checked:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-primary-action) 8%, transparent)",
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: "var(--color-primary-action)",
    opacity: 1,
  },
  "& .MuiSwitch-track": {
    backgroundColor: "var(--color-border)",
    opacity: 1,
  },
  "& .MuiSwitch-switchBase.Mui-disabled": {
    opacity: 0.5,
  },
  "& .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track": {
    opacity: 0.5,
  },
};

export type ToggleSwitchProps = Omit<SwitchProps, "color" | "className"> & {
  /** Optional label rendered next to the switch. */
  label?: React.ReactNode;
  /** Where the label sits relative to the switch (defaults to "end"). */
  labelPlacement?: "start" | "end";
  /**
   * Applied to the outer FormControlLabel when `label` is set (so existing
   * layout/spacing classes like `.checkboxLabel` keep working unchanged),
   * otherwise applied directly to the Switch root.
   */
  className?: string;
  /** Same idea as `className` above, but for an inline style object. */
  wrapperStyle?: React.CSSProperties;
};

/**
 * The one common control for every boolean checkbox in the admin app —
 * a Material UI Switch styled to turn brand green (var(--color-primary-action))
 * when on, so light/dark mode tracks automatically via the existing
 * [data-theme] CSS variables instead of a second, MUI-only theme mode.
 */
export function ToggleSwitch({
  label,
  labelPlacement = "end",
  className,
  wrapperStyle,
  ...switchProps
}: ToggleSwitchProps) {
  if (!label) {
    return (
      <Switch sx={switchSx} className={className} style={wrapperStyle} {...switchProps} />
    );
  }

  return (
    <FormControlLabel
      className={className}
      style={wrapperStyle}
      control={<Switch sx={switchSx} {...switchProps} />}
      label={label}
      labelPlacement={labelPlacement}
    />
  );
}
