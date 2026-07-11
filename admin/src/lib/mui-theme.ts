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
      main: "#2e8c00", // --color-primary-action (light)
      dark: "#256f00", // --color-primary-action-hover (light)
      contrastText: "#ffffff",
    },
    error: { main: "#dc2626" }, // --color-error (light)
    warning: { main: "#d97706" }, // --color-warning (light)
    success: { main: "#16a34a" }, // --color-success (light)
    info: { main: "#1d4ed8" }, // --color-info (light)
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
  },
});
