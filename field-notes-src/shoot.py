import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

out = pathlib.Path(sys.argv[1])
posts = json.loads(pathlib.Path(__file__).with_name("manifest.json").read_text())

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        # share cards 1200x630
        pg = await b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        for p in posts:
            await pg.goto((pathlib.Path(__file__).with_name("_cards") / f"{p['slug']}.html").resolve().as_uri())
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=out / "field-notes" / "img" / f"{p['slug']}.png")
        await b.close()

asyncio.run(main())
