"use client";

import { motion, useReducedMotion } from "motion/react";
import { Constellation } from "./Constellation";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 40 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease: EASE },
        };

  return (
    <section className="mx-auto grid max-w-[1280px] items-center gap-36 px-24 pt-60 lg:grid-cols-2 lg:pt-96">
      <div>
        <h1 className="text-heading-sm leading-[1] tracking-heading-sm font-normal md:text-heading-lg md:tracking-heading-lg xl:text-display xl:tracking-display">
          {["Reshape", "any image."].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <motion.span className="block" {...rise(0.1 + i * 0.12)}>
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.div {...rise(0.4)}>
          <p className="mt-36 text-nav-label font-semibold uppercase tracking-nav-label text-saffron-spark">
            Crop · Resize · Remove background
          </p>
          <p className="mt-18 max-w-[480px] text-body leading-body">
            Drop in a picture, pick what you need, and get it back in seconds. No accounts, no layers, no learning curve.
          </p>
          <motion.a
            href="#editor"
            whileHover={reduce ? undefined : { scale: 1.03 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            className="mt-36 inline-block rounded-[22.5px] bg-electric-iris px-[16px] py-[14.4px] text-nav-label font-semibold uppercase tracking-nav-label text-bone-white"
          >
            Start reshaping
          </motion.a>
        </motion.div>
      </div>
      <Constellation className="mx-auto w-full max-w-[640px]" />
    </section>
  );
}
