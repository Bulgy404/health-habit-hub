import React from "react";
import { render, screen } from "@testing-library/react";
import HelpPage from "../app/(admin)/help/page";

describe("HelpPage", () => {
  it("renders the page title and a section per admin module", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { name: /^help$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /studies/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /participants/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /questionnaires/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /cue pools/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /backups/i })).toBeInTheDocument();
  });
});
