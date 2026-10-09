"use server";
import { cookies } from "next/headers";

export async function greet(formData) {
  (await cookies()).set("greeted", String(formData.get("name")));
}
