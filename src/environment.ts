import { ConfigurationError } from "./errors.js"

export type Environment = "test" | "live"

export const TEST_PREFIX = "paysafe_test_"
export const LIVE_PREFIX = "paysafe_live_"

export function environmentFromKey(apiKey: string): Environment {
  if (apiKey.startsWith(TEST_PREFIX)) return "test"
  if (apiKey.startsWith(LIVE_PREFIX)) return "live"
  throw new ConfigurationError("API key must start with paysafe_test_ or paysafe_live_")
}
