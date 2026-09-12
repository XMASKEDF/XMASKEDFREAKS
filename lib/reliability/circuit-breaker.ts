export type CircuitState = "closed" | "open" | "half_open";
type Circuit = { state: CircuitState; failures: number; openedAt: number; nextProbeAt: number };
const circuits = new Map<string, Circuit>();

export class CircuitOpenError extends Error {
  provider: string;

  constructor(provider: string) {
    super(`${provider} is temporarily unavailable.`);
    this.name = "CircuitOpenError";
    this.provider = provider;
  }
}

export async function withCircuitBreaker<T>(
  provider: string,
  operation: () => Promise<T>,
  options: { threshold?: number; cooldownMs?: number } = {}
) {
  const threshold = Math.max(1, options.threshold || 5);
  const cooldownMs = Math.max(1000, options.cooldownMs || 30_000);
  const circuit = circuits.get(provider) || { state: "closed" as const, failures: 0, openedAt: 0, nextProbeAt: 0 };
  if (circuit.state === "open" && Date.now() < circuit.nextProbeAt) throw new CircuitOpenError(provider);
  if (circuit.state === "open") circuit.state = "half_open";
  try {
    const result = await operation();
    circuits.set(provider, { state: "closed", failures: 0, openedAt: 0, nextProbeAt: 0 });
    return result;
  } catch (error) {
    const failures = circuit.failures + 1;
    const open = failures >= threshold || circuit.state === "half_open";
    circuits.set(provider, {
      state: open ? "open" : "closed",
      failures,
      openedAt: open ? Date.now() : 0,
      nextProbeAt: open ? Date.now() + cooldownMs : 0
    });
    throw error;
  }
}

export function circuitSnapshot() {
  return Array.from(circuits, ([provider, value]) => ({ provider, ...value }));
}

export function resetCircuit(provider: string) {
  circuits.delete(provider);
}
