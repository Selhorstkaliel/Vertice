import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Conta de 0 até `to` quando o elemento entra na tela. Com movimento reduzido, mostra o valor final. */
export function useCountUp<T extends HTMLElement>(to: number, { duration = 1.2, decimals = 0 } = {}) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setValue(Number(v.toFixed(decimals))),
    });
    return () => controls.stop();
  }, [inView, reduce, to, duration, decimals]);

  return { ref, value };
}
