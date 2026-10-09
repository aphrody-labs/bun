"use client";
import { useState } from "react";
import { echo } from "./client-actions";

export default function EchoButton() {
  const [reply, setReply] = useState("");
  return <button onClick={async () => setReply(await echo("click"))}>reply: {reply}</button>;
}
