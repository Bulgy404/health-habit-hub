import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { muiTheme } from "../lib/mui-theme";
import { ToggleSwitch } from "../components/toggle-switch";

// createTheme() derives shades from the palette at import time and throws on
// unparseable colors (e.g. `var(...)` strings — MUI error #9), which took the
// whole app down in production while build and page tests stayed green. This
// suite exists to catch that at test time: importing the theme and rendering
// a themed component is the whole point.
describe("muiTheme", () => {
  it("renders a themed ToggleSwitch without crashing", () => {
    render(
      <ThemeProvider theme={muiTheme}>
        <ToggleSwitch label="Enable feature" checked onChange={() => {}} />
      </ThemeProvider>
    );
    expect(screen.getByRole("switch", { name: /enable feature/i })).toBeChecked();
  });

  it("routes aria-label to the underlying input when there is no label", () => {
    render(
      <ThemeProvider theme={muiTheme}>
        <ToggleSwitch aria-label="Select row" checked={false} onChange={() => {}} />
      </ThemeProvider>
    );
    expect(screen.getByRole("switch", { name: /select row/i })).not.toBeChecked();
  });
});
