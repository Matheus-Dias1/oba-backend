import express from "express";
import mongoose from "mongoose";
import { authenticateToken } from "../middleware/authorization";
import { Product } from "../models/product";
import { decodeCursor, encodeCursor, PageInfo } from "../utils/pagination";

const router = express.Router();
router.use(authenticateToken);

const DEFAULT_PAGE_SIZE = 29;

/** Indexes products */
router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const { search: pSearch, afterCursor } = req.query;

    const searchQuery = pSearch ? pSearch.toString() : undefined;
    const searchFilter = Object.assign(
      { archived: false },
      searchQuery && { description: new RegExp(searchQuery, "i") }
    );

    const cursorFilters: any = afterCursor
      ? {
          _id: {
            $gt: decodeCursor(afterCursor),
          },
        }
      : {};

    let items = await Product.find({
      $and: [cursorFilters, searchFilter],
    }).limit(DEFAULT_PAGE_SIZE + 1);

    const hasNextPage = items.length > DEFAULT_PAGE_SIZE;
    if (hasNextPage) items = items.slice(0, DEFAULT_PAGE_SIZE);

    const edges = items.map((r) => ({
      cursor: encodeCursor(r.id.toString()),
      node: r,
    }));

    const pageInfo: PageInfo = {
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      hasNextPage,
      startCursor: edges.length > 0 ? edges[0].cursor : null,
    };

    res.send({
      pageInfo,
      edges,
      totalCount: await Product.countDocuments(searchFilter),
    });
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Add new product */
router.post("/", async (req: express.Request, res: express.Response) => {
  try {
    const { description, defaultMeasurementUnit, conversions } = req.body;

    if (!description || !defaultMeasurementUnit || !conversions)
      return res.sendStatus(400);

    const newProduct = new Product({
      description,
      defaultMeasurementUnit,
      conversions,
      archived: false,
    });

    newProduct.save((err, prod) => {
      if (err) res.sendStatus(500);
      else res.status(201).send({ id: prod.id });
    });
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Updated a product */
router.put("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = req.params.id;
    const { description, defaultMeasurementUnit, conversions } = req.body;

    const update = {
      $set: Object.assign(
        {},
        description ? { description } : null,
        defaultMeasurementUnit ? { defaultMeasurementUnit } : null,
        conversions ? { conversions } : null
      ),
    };
    if (Object.keys(update.$set).length > 0) {
      await Product.updateOne({ _id: new mongoose.Types.ObjectId(id) }, update);
      return res.sendStatus(200);
    }

    res.sendStatus(400);
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Gets a product */
router.get("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = req.params.id;
    const product = await Product.findById(id);
    res.send(product);
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Archives a product */
router.delete("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = req.params.id;

    await Product.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { archived: true } }
    );

    res.sendStatus(200);
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

export default router;
