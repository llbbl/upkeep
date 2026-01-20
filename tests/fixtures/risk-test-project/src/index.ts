import express from "express";
import { debounce } from "lodash";

const app = express();

export { app, debounce };
