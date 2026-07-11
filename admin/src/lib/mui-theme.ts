import { createTheme } from "@mui/material/styles";

/**
 * MUI theme mapped onto the app's own CSS custom properties (see globals.css)
 * rather than hardcoded hex values, so MUI components stay in sync with the
 * existing light/dark toggle (which flips `[data-theme]`, not a React
 * palette.mode) without any extra wiring.
 */
export const muiTheme = createTheme({
  palette: {
    primary: {
      main: "var(--color-primary-action)",
      dark: "var(--color-primary-action-hover)",
      contrastText: "#ffffff",
    },
    error: {
      main: "var(--color-error)",
    },
    warning: {
      main: "var(--color-warning)",
    },
    success: {
      main: "var(--color-success)",
    },
    info: {
      main: "var(--color-info)",
    },
    text: {
      primary: "var(--color-text)",
      secondary: "var(--color-text-muted)",
    },
    background: {
      default: "var(--color-bg)",
      paper: "var(--color-surface)",
    },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
});
