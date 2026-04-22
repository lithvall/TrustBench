export interface Provider {
  id: string;
  url: string;
  capability: 'search' | 'inference' | 'data' | 'social' | 'infra';
  name: string;
  description?: string;
}

export interface ProbeResult {
  provider_id: string;
  timestamp: string;
  latency_ms: number;
  status: 'success' | 'error' | 'timeout';
  error?: string;
  region: string;
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