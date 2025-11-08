import { createTRPCRouter } from './trpc';
import { organizationRouter } from './router/organization';
import { repositoryRouter } from './router/repository';
import { taskRouter } from './router/task';

export const appRouter = createTRPCRouter({
  organization: organizationRouter,
  repository: repositoryRouter,
  task: taskRouter,
});

export type AppRouter = typeof appRouter;

// Export tRPC instance for extending in other packages (e.g., Electron app)
export { createTRPCRouter } from './trpc';
