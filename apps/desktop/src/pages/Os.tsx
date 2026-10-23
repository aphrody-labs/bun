// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { DesktopOS } from "../os/DesktopOS";

/** The windowed Bun WebOS, shown full screen over the shell; its main menu leads back to the hub. */
export function OsPage() {
  const navigate = useNavigate();
  return (
    <div className="os-host">
      <DesktopOS onExit={() => void navigate({ to: "/" })} />
    </div>
  );
}
