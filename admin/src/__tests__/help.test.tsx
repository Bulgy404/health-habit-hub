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

  it("renders a mailto contact link and a GitHub repo link", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { name: /contact & support/i })).toBeInTheDocument();

    const mailLink = screen.getByRole("link", {
      name: "felix.reinsch@tu-dresden.de",
    });
    expect(mailLink).toHaveAttribute("href", "mailto:felix.reinsch@tu-dresden.de");

    const repoLink = screen.getByRole("link", {
      name: "https://github.com/Bulgy404/health-habit-hub",
    });
    expect(repoLink).toHaveAttribute("href", "https://github.com/Bulgy404/health-habit-hub");
    expect(repoLink).toHaveAttribute("target", "_blank");
    expect(repoLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});
