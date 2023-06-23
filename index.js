import { down, left, mouse, right, up } from "@nut-tree/nut-js";

const height = 200;
const width = 200;

mouse.config.mouseSpeed = 100;

setInterval(async ()  => {
  try {
    await mouse.move(down(height));
    await mouse.move(right(width));
    await mouse.move(up(height));
    await mouse.move(left(width));
  } catch (err) {
    console.log(err)
  }
}, 1000 * 60 * 2)
