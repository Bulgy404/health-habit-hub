/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../components/sidebar";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/studies",
  useRouter: () => ({ refresh: jest.fn() }),
}));

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

import { useSession } from "next-auth/react";
const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;

// Mock next/link
jest.mock("next/link", () => {
  return function Link({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  };
});

describe("Sidebar", () => {
  it("shows Studies, Analytics and Questionnaires for researcher", () => {
    mockedUseSession.mockReturnValue({
      data: { roles: ["researcher"], accessToken: "", user: { email: "r@test.com" }, expires: "" },
      status: "authenticated",
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.getByText("Studies")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Questionnaires")).toBeInTheDocument();
    expect(screen.queryByText("Knowledge Base")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity Types")).not.toBeInTheDocument();
    expect(screen.queryByText("App Settings")).not.toBeInTheDocument();
  });

  it("shows only Studies, Analytics and Help for a study-researcher (#66)", () => {
    mockedUseSession.mockReturnValue({
      data: {
        roles: ["study-researcher"],
        accessToken: "",
        user: { email: "p@partner.test" },
        expires: "",
      },
      status: "authenticated",
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.getByText("Studies")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
    // Shared across studies, so hidden from an account limited to its own.
    expect(screen.queryByText("Questionnaires")).not.toBeInTheDocument();
    expect(screen.queryByText("Cue Pools")).not.toBeInTheDocument();
    expect(screen.queryByText("Participants")).not.toBeInTheDocument();
  });

  it("the narrower role wins when an account also holds researcher", () => {
    mockedUseSession.mockReturnValue({
      data: {
        roles: ["researcher", "study-researcher"],
        accessToken: "",
        user: { email: "p@partner.test" },
        expires: "",
      },
      status: "authenticated",
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.queryByText("Questionnaires")).not.toBeInTheDocument();
  });

  it("shows all nav items for admin", () => {
    mockedUseSession.mockReturnValue({
      data: { roles: ["admin"], accessToken: "", user: { email: "a@test.com" }, expires: "" },
      status: "authenticated",
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.getByText("Studies")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Questionnaires")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
    // Activity Types moved into the study settings (Cue Config tab).
    expect(screen.queryByText("Activity Types")).not.toBeInTheDocument();
    // Public App settings removed — managed via the default study instead.
    expect(screen.queryByText("App Settings")).not.toBeInTheDocument();
  });

  it("shows Profile Fields for admin", () => {
    mockedUseSession.mockReturnValue({
      data: { roles: ["admin"], accessToken: "", user: { email: "a@test.com" }, expires: "" },
      status: "authenticated",
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.getByText("Profile Fields")).toBeInTheDocument();
  });

  it("does not show Profile Fields for researcher", () => {
    mockedUseSession.mockReturnValue({
      data: { roles: ["researcher"], accessToken: "", user: { email: "r@test.com" }, expires: "" },
      status: "authenticated",
      update: jest.fn(),
    });
    render(<Sidebar />);
    expect(screen.queryByText("Profile Fields")).not.toBeInTheDocument();
  });
});
