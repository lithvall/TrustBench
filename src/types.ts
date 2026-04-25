export interface Provider {
  provider_id: string;
  capability: string;
  name: string;
  url: string;
  description?: string;
  pay_to?: string;
}

export interface ProbeResult {
  provider_id: string;
  capability: string;
  region: string;
  latency_ms: number;
  success: boolean;
  timestamp: string;
}

export interface Scorecard {
  provider_id: string;
  capability: string;
  score: number;
  latency_p50: number;
  latency_p95: number;
  uptime_7d: number;
  last_updated: string;
  signature?: string;
}