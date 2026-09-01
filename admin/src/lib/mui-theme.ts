import { createTheme } from "@mui/material/styles";

/**
 * MUI palette colors must be statically parseable (hex/rgb/hsl) because
 * createTheme() derives shades and contrast text from them at import time —
 * `var(...)` strings crash it with MUI error #9. So the palette carries the
 * light-theme hex values from globals.css, and anything that must follow the
 * app's [data-theme] light/dark toggle at runtime uses `var(...)` in
 * CSS-output positions instead: the styleOverrides below and the sx prop in
 * toggle-switch.tsx (which is what actually colors the switches).
 */
export const muiTheme = createTheme({
  palette: {
    primary: {
      main: "#c2410c", // --color-primary-action (light)
      dark: "#9a3412", // --color-primary-action-hover (light)
      contrastText: "#ffffff",
    },
    error: { main: "#dc2626" }, // --color-error (light)
    warning: { main: "#d97706" }, // --color-warning (light)
    success: { main: "#16a34a" }, // --color-success (light)
    info: { main: "#1d4ed8" }, // --color-info (light)
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiFormControlLabel: {
      styleOverrides: {
        // Labels inherit the app's themed text color instead of MUI's static
        // palette, so they stay readable when [data-theme] flips to dark.
        label: {
          color: "var(--color-text)",
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        // Move MUI's default track/thumb-color transitions onto the app's
        // shared motion tokens. Deliberately NOT touching
        // .MuiSwitch-switchBase's thumb-position transition here — MUI
        // positions it via `left` (a layout property, not `transform`), and
        // an animation-review pass flagged animating `left` as forcing a
        // layout pass on every toggle. Overriding MUI's internal
        // positioning to use `transform` instead would mean re-implementing
        // SwitchBase's layout, not worth it for a toggle switch — left as
        // MUI's own default transition instead of adding one on top of it.
        root: {
          "& .MuiSwitch-switchBase": {
            transition: "color var(--dur-fast) var(--ease-standard)",
          },
          "& .MuiSwitch-track": {
            transition: "background-color var(--dur-fast) var(--ease-standard)",
          },
          "& .MuiSwitch-thumb": {
            transition: "transform var(--dur-fast) var(--ease-standard)",
          },
        },
      },
    },
  },
});
