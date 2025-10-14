import CircuitBreaker from 'opossum';

// Função genérica que cria um circuito de proteção
export function createCircuitBreaker(fn, name = 'default') {
  const options = {
    timeout: 2000,           // tempo limite para cada execução
    errorThresholdPercentage: 50, // se 50% das execuções falharem → abre o circuito
    resetTimeout: 10000,     // após 10s tenta fechar novamente
  };

  const breaker = new CircuitBreaker(fn, options);

  breaker.on('open', () => console.warn(`[circuit] ⚠️ Circuito "${name}" ABERTO — requisições temporariamente bloqueadas`));
  breaker.on('halfOpen', () => console.info(`[circuit] 🔄 Circuito "${name}" em HALF-OPEN — testando nova tentativa`));
  breaker.on('close', () => console.info(`[circuit] ✅ Circuito "${name}" FECHADO — requisições normalizadas`));
  breaker.on('failure', err => console.warn(`[circuit] "${name}" falhou:`, err.message));

  return breaker;
}
