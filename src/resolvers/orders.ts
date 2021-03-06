import express from "express";
import mongoose from "mongoose";
import { authenticateToken } from "../middleware/authorization";
import { Batch } from "../models/batch";
import { Order } from "../models/order";
import { decodeCursor, encodeCursor, PageInfo } from "../utils/pagination";

const router = express.Router();
router.use(authenticateToken);

const DEFAULT_PAGE_SIZE = 30;

/** Indexes orders */
router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const { search: pSearch, afterCursor } = req.query;

    const searchQuery = pSearch ? parseInt(pSearch.toString(), 10) : undefined;
    const searchFilter = Object.assign(
      { archived: false },
      searchQuery ? { batch: searchQuery } : {}
    );

    const cursorFilters: any = afterCursor
      ? {
          _id: {
            $lt: decodeCursor(afterCursor),
          },
        }
      : {};

    let items = await Order.find({
      $and: [cursorFilters, searchFilter],
    })
      .limit(DEFAULT_PAGE_SIZE + 1)
      .populate({
        path: "items",
        populate: {
          path: "item",
          model: "Product",
          select: "-_id",
        },
      })
      .populate({
        path: "batch",
        model: "Batch",
        select: "_id number",
      })
      .sort({ _id: -1 });

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
      totalCount: await Order.countDocuments(searchFilter),
    });
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Add new Order */
router.post("/", async (req: express.Request, res: express.Response) => {
  try {
    const { client, batch, deliverAt, items } = req.body;

    if (!client || !batch || !deliverAt || !items) return res.sendStatus(400);
    items.forEach((item: any) => {
      item.item = new mongoose.Types.ObjectId(item.item);
    });

    const newOrder = new Order({
      client,
      deliverAt,
      items,
      batch,
      createdAt: new Date(),
      archived: false,
    });

    newOrder.save(async (err, order) => {
      if (err) return res.sendStatus(500);
      await Batch.findByIdAndUpdate(batch, { $push: { orders: order.id } });
      res.status(201).send({ id: order.id });
    });
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Gets a Order */
router.get("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = req.params.id;
    const order = await Order.findById(id)
      .populate({
        path: "items",
        populate: {
          path: "item",
          model: "Product",
        },
      })
      .populate({
        path: "batch",
        model: "Batch",
      });
    res.send(order);
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Updated a Order */
router.put("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = req.params.id;
    const { client, batch, deliverAt, items } = req.body;

    const update = {
      $set: Object.assign(
        {},
        client ? { client } : null,
        batch ? { batch } : null,
        deliverAt ? { deliverAt } : null,
        items ? { items } : null
      ),
    };
    if (Object.keys(update.$set).length > 0) {
      await Order.updateOne({ _id: new mongoose.Types.ObjectId(id) }, update);
      return res.sendStatus(200);
    }

    res.sendStatus(400);
  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    res.sendStatus(422);
  }
});

/** Archives a Order */
router.delete("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = req.params.id;

    await Order.updateOne(
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
