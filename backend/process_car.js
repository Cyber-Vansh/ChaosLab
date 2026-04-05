const { Jimp } = require("jimp");

async function main() {
  try {
    const image = await Jimp.read('/Users/vanshsinghal/.gemini/antigravity/brain/a55e8411-6cf9-403e-8d45-6a584bcf5391/sprite_flat_normal_car_1776511822832.png');
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const r = this.bitmap.data[idx];
      const g = this.bitmap.data[idx+1];
      const b = this.bitmap.data[idx+2];
      // transparent if close to white
      if (r > 240 && g > 240 && b > 240) {
        this.bitmap.data[idx+3] = 0;
      }
    });
    await image.write("../frontend/public/car.png");
    console.log("Success");
  } catch(e) {
    console.error(e);
  }
}
main();
