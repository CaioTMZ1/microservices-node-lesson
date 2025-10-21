import CircuitBreaker from 'opossum';

export function createCircuitBreaker(fn, name = 'default') {
  const options = {
    timeout: 2000,           
    errorThresholdPercentage: 50, 
    resetTimeout: 10000,     
  };

  const breaker = new CircuitBreaker(fn, options);

  breaker.on('open', () => console.warn(`[circuit]  Circuito "${name}" ABERTO — requisições temporariamente bloqueadas`));
  breaker.on('halfOpen', () => console.info(`[circuit]  Circuito "${name}" em HALF-OPEN — testando nova tentativa`));
  breaker.on('close', () => console.info(`[circuit]  Circuito "${name}" FECHADO — requisições normalizadas`));
  breaker.on('failure', err => console.warn(`[circuit] "${name}" falhou:`, err.message));

  return breaker;
}
