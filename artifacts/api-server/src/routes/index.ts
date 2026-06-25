import { Router, type IRouter } from "express";
import healthRouter from "./health";
import athleteRouter from "./athlete";
import activitiesRouter from "./activities";
import statsRouter from "./stats";
import powerRouter from "./power";

const router: IRouter = Router();

router.use(healthRouter);
router.use(athleteRouter);
router.use(activitiesRouter);
router.use(statsRouter);
router.use(powerRouter);

export default router;
