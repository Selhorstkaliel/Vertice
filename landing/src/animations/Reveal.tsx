import { motion, type HTMLMotionProps } from "framer-motion";
import { fadeUp, stagger, viewport } from "./motion";

type RevealProps = HTMLMotionProps<"div"> & { delay?: number };

/** Entrada padrão por scroll: opacidade e 24px de deslocamento, uma única vez. */
export function Reveal({ delay = 0, children, ...props }: RevealProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={fadeUp}
      transition={{ delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Grupo com stagger; os filhos usam `RevealItem`. */
export function RevealGroup({ gap = 0.08, delay = 0, children, ...props }: HTMLMotionProps<"div"> & { gap?: number; delay?: number }) {
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={viewport} variants={stagger(gap, delay)} {...props}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={fadeUp} {...props}>
      {children}
    </motion.div>
  );
}
