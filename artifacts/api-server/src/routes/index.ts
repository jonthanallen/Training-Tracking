import { Router, type IRouter } from "express";
import healthRouter from "./health";
import athleteRouter from "./athlete";
import activitiesRouter from "./activities";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(athleteRouter);
router.use(activitiesRouter);
router.use(statsRouter);

export default router;
