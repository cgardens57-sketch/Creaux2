import {
  Outlet,
  RouterContextProvider,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { forwardRef, useRef } from 'react';

const SLIDE_DISTANCE = 58;
const SCALE_FACTOR = 0.975;

const slideVariants = {
  enter: {
    x: SLIDE_DISTANCE,
    rotateY: -4,
    scale: SCALE_FACTOR,
    opacity: 0,
    filter: 'blur(10px) saturate(.7)',
    clipPath: 'polygon(8% 0, 100% 0, 94% 100%, 0 100%)',
  },
  center: {
    x: 0,
    rotateY: 0,
    scale: 1,
    opacity: 1,
    filter: 'blur(0px) saturate(1)',
    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
  },
  exit: {
    x: -SLIDE_DISTANCE,
    rotateY: 4,
    scale: SCALE_FACTOR,
    opacity: 0,
    filter: 'blur(8px) saturate(.7)',
    clipPath: 'polygon(0 0, 92% 0, 100% 100%, 6% 100%)',
  },
};

const AnimatedOutlet = forwardRef<HTMLDivElement>((_, ref) => {
  const router = useRouter();
  const isPresent = useIsPresent();
  const frozenState = useRef(router.__store.state);
  const frozenRouter = useRef(router);

  if (isPresent) {
    frozenState.current = router.__store.state;
    frozenRouter.current = router;
  } else if (frozenRouter.current === router) {
    const snapshot = frozenState.current;
    const storeProxy = Object.create(router.__store) as typeof router.__store;
    Object.defineProperty(storeProxy, 'state', { get: () => snapshot });
    Object.defineProperty(storeProxy, 'get', { value: () => snapshot });

    const routerProxy = Object.create(router) as typeof router;
    Object.defineProperty(routerProxy, '__store', { value: storeProxy });
    frozenRouter.current = routerProxy;
  }

  return (
    <motion.div
      ref={ref}
      className="absolute inset-0 h-full w-full transform-3d"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{
        duration: 0.38,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <RouterContextProvider router={frozenRouter.current}>
        <Outlet />
      </RouterContextProvider>
    </motion.div>
  );
});

export const RouteTransition = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <AnimatedOutlet key={pathname} />
      </AnimatePresence>
    </div>
  );
};
