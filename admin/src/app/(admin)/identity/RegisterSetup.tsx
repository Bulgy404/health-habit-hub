"use client";

import { useState } from "react";
import {
  createRegister,
  SUBJECT_CODE_PREFIX_PATTERN,
  type RegisterState,
} from "@/lib/identityApi";

/**
 * The state of a register before it is usable, and the way out of each.
 *
 * Three distinct situations look identical on a roster page — an empty table —
 * and telling them apart is the whole job of this component:
 *
 * 1. **No register exists.** Nothing works until one is created, and until
 *    this component existed the only way to create one was a hand-rolled
 *    `curl` with a bearer token.
 * 2. **A register exists but the viewer is not assigned to it.** They hold the
 *    realm role and see nothing. The fix is somebody else's action, so saying
 *    "no subjects yet" would send them looking in the wrong place.
 * 3. **Ready.** Show the prefix, because a subject code is only traceable back
 *    to its register through it.
 */
export function RegisterSetup({
  token,
  studyId,
  state,
  canManage,
  defaultPrefix,
  onCreated,
}: {
  token: string;
  studyId: string;
  state: RegisterState;
  canManage: boolean;
  /** The study's configured `identity.subjectCodePrefix`, when known. */
  defaultPrefix?: string | null;
  onCreated: () => void;
}) {
  const [prefix, setPrefix] = useState(defaultPrefix ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.exists && state.assigned) {
    return (
      <p style={{ color: "#666", margin: "8px 0" }}>
        Register ready — subject codes are minted as{" "}
        <code>{state.subjectCodePrefix}-0001</code>.
      </p>
    );
  }

  if (state.exists && !state.assigned) {
    return (
      <div
        role="status"
        style={{ border: "1px solid #b26a00", padding: 12, margin: "12px 0" }}
      >
        <strong>You are not assigned to this register.</strong>
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
          Your role says what you may do; an assignment says where. Until an
          identity-manager assigns you to this register you will see an empty
          roster, whatever role you hold. This is not a fault — ask them to add
          you.
        </p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div
        role="status"
        style={{ border: "1px solid #b26a00", padding: 12, margin: "12px 0" }}
      >
        <strong>No register exists for this study yet.</strong>
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
          An identity-manager has to create it before anyone can be enrolled.
        </p>
      </div>
    );
  }

  const valid = SUBJECT_CODE_PREFIX_PATTERN.test(prefix);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createRegister(token, studyId, prefix);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the register");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: 12, margin: "12px 0" }}>
      <strong>No register exists for this study yet.</strong>
      <p style={{ margin: "6px 0", fontSize: 13 }}>
        The prefix is <em>frozen once created</em> — every subject code issued
        embeds it, so it cannot be changed later. It must match the study&rsquo;s
        configured subject-code prefix, or a code will not be traceable back to
        the register that minted it.
      </p>
      <label>
        Subject-code prefix{" "}
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          placeholder="TUD-ICU01"
          aria-label="Subject-code prefix"
          style={{ width: 200, fontFamily: "monospace" }}
        />
      </label>{" "}
      <button onClick={() => void onCreate()} disabled={!valid || busy}>
        {busy ? "Creating…" : "Create register"}
      </button>
      {prefix !== "" && !valid && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#a00" }}>
          Upper-case letters, digits and dashes only, 2–32 characters.
        </p>
      )}
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#666" }}>
        You will be assigned to it automatically as identity-manager, so the
        register is never left with nobody able to administer it.
      </p>
      {error && (
        <p role="alert" style={{ color: "#a00", margin: "6px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}
