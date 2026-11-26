import { describe, expect, it } from "vitest";
import { findPickerResponse, pickerUrl } from "./google";

const BASE = "https://docs.google.com/picker?protocol=gadgets&origin=https%3A%2F%2Fberrypdf.test&oauth_token=ya29.a(b)&developerKey=K&nav=((%22all%22%2Cnull))";

describe("pickerUrl", () => {
  it("adds the app ID and the token's account", () => {
    const u = new URL(pickerUrl(BASE, { appId: "123456789", authUser: "a.b+c@example.com" }));
    expect(u.searchParams.get("appId")).toBe("123456789");
    expect(u.searchParams.get("authuser")).toBe("a.b+c@example.com");
  });

  it("accepts the URL object the live toUri() returns", () => {
    const obj = { toString: () => BASE };
    expect(new URL(pickerUrl(obj, { appId: "9" })).searchParams.get("appId")).toBe("9");
    expect(pickerUrl(obj)).toBe(BASE);
  });

  it("leaves both out when unknown", () => {
    expect(pickerUrl(BASE, { appId: "", authUser: "" })).toBe(BASE);
    expect(pickerUrl(BASE)).toBe(BASE);
  });

  it("keeps the rest of toUri()'s query byte for byte", () => {
    expect(pickerUrl(BASE, { appId: "1" }).startsWith(`${BASE}&`)).toBe(true);
  });

  it("puts the parameters before a #fragment, which the server never sees", () => {
    const frag = `${BASE}#rpctoken=1`;
    const out = pickerUrl(frag, { appId: "123", authUser: "a@b.c" });
    expect(out.endsWith("#rpctoken=1")).toBe(true);
    const u = new URL(out);
    expect(u.searchParams.get("appId")).toBe("123");
    expect(u.searchParams.get("authuser")).toBe("a@b.c");
  });

  it("does not add authuser twice when setAuthUser already set it", () => {
    const withUser = `${BASE}&authuser=a%40example.com`;
    expect(new URL(pickerUrl(withUser, { authUser: "a@example.com" })).searchParams.getAll("authuser")).toEqual(["a@example.com"]);
  });
});

describe("findPickerResponse", () => {
  it("finds a pick nested in a JSON string", () => {
    const msg = JSON.stringify({ s: "x", f: { a: [{ action: "picked", docs: [{ id: "1", name: "a.pdf" }, { id: 2 }] }] } });
    expect(findPickerResponse(msg)).toEqual({ action: "picked", docs: [{ id: "1", name: "a.pdf" }] });
  });

  it("ignores unrelated messages", () => {
    expect(findPickerResponse({ action: "loaded" })).toBeNull();
    expect(findPickerResponse("not json")).toBeNull();
  });
});
