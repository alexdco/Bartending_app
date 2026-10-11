import { describe, expect, it } from "vitest";
import {
  UNKNOWN_IP_BUCKET,
  clientIpFromHeaders,
  hashIpBucket,
  ipBucket,
  parseIp,
} from "./ip-bucket";

const headersOf = (entries: Record<string, string>) => new Headers(entries);

describe("clientIpFromHeaders", () => {
  it("reads cf-connecting-ip", () => {
    expect(clientIpFromHeaders(headersOf({ "cf-connecting-ip": "209.6.180.16" }))).toBe(
      "209.6.180.16",
    );
  });

  it("ignores a forged x-forwarded-for, using only the edge set header", () => {
    const headers = headersOf({
      "cf-connecting-ip": "209.6.180.16",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(clientIpFromHeaders(headers)).toBe("209.6.180.16");
  });

  it("never falls back to x-forwarded-for, whose rightmost entry is a load balancer", () => {
    const headers = headersOf({ "x-forwarded-for": "209.6.180.16,209.6.180.16, 13.248.108.74" });
    expect(clientIpFromHeaders(headers)).toBeNull();
  });

  it("never reads client controlled true-client-ip, x-real-ip, or forwarded", () => {
    const headers = headersOf({
      "true-client-ip": "9.9.9.9",
      "x-real-ip": "5.6.7.8",
      forwarded: "for=1.2.3.4",
    });
    expect(clientIpFromHeaders(headers)).toBeNull();
  });

  it("returns null for a header that is not exactly one IP", () => {
    expect(clientIpFromHeaders(headersOf({ "cf-connecting-ip": "1.2.3.4, 5.6.7.8" }))).toBeNull();
    expect(clientIpFromHeaders(headersOf({ "cf-connecting-ip": "not-an-ip" }))).toBeNull();
    expect(clientIpFromHeaders(headersOf({ "cf-connecting-ip": "" }))).toBeNull();
  });

  it("accepts an IPv6 address", () => {
    expect(clientIpFromHeaders(headersOf({ "cf-connecting-ip": "2001:db8::1" }))).toBe(
      "2001:db8::1",
    );
  });
});

describe("ipBucket", () => {
  it("keeps a full IPv4 address", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
  });

  it("puts compressed and expanded forms of one /64 in the same bucket", () => {
    const expected = "2001:db8:abcd:12::/64";
    expect(ipBucket("2001:db8:abcd:12::1")).toBe(expected);
    expect(ipBucket("2001:0db8:abcd:0012:0000:0000:0000:0002")).toBe(expected);
    expect(ipBucket("2001:DB8:ABCD:12:ffff:ffff:ffff:ffff")).toBe(expected);
  });

  it("separates addresses in different /64s", () => {
    expect(ipBucket("2001:db8:abcd:12::1")).not.toBe(ipBucket("2001:db8:abcd:13::1"));
  });

  it("treats IPv4 mapped IPv6 as IPv4", () => {
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("strips brackets, ports, and zone IDs", () => {
    expect(ipBucket("[2001:db8:1:2::3]:443")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("[::1]")).toBe("0:0:0:0::/64");
    expect(ipBucket("203.0.113.7:80")).toBe("203.0.113.7");
    expect(ipBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("maps null and garbage to unknown", () => {
    const garbage = [
      null,
      "",
      "hello",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "1::2::3",
      "1:2:3:4:5:6:7:8:9",
      "12345::1",
      "::ffff:1.2.3.999",
    ];
    garbage.forEach((value) => expect(ipBucket(value)).toBe(UNKNOWN_IP_BUCKET));
  });

  it("parses all zero and full length IPv6", () => {
    expect(parseIp("::")).toEqual({ kind: "v6", hextets: [0, 0, 0, 0, 0, 0, 0, 0] });
    expect(ipBucket("1:2:3:4:5:6:7:8")).toBe("1:2:3:4::/64");
  });
});

describe("hashIpBucket", () => {
  it("is a 64 character lowercase hex HMAC", async () => {
    expect(await hashIpBucket("203.0.113.7", "secret")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same bucket and secret", async () => {
    expect(await hashIpBucket("203.0.113.7", "secret")).toBe(
      await hashIpBucket("203.0.113.7", "secret"),
    );
  });

  it("changes with the secret and with the bucket", async () => {
    const base = await hashIpBucket("203.0.113.7", "secret");
    expect(await hashIpBucket("203.0.113.7", "other secret")).not.toBe(base);
    expect(await hashIpBucket("203.0.113.8", "secret")).not.toBe(base);
  });

  it("matches the known HMAC SHA-256 test vector", async () => {
    // RFC 4231 test case 2.
    expect(await hashIpBucket("what do ya want for nothing?", "Jefe")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});
