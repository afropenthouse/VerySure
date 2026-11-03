from pathlib import Path
from PIL import Image, ImageDraw
out = Path(__file__).resolve().parents[1] / 'assets'
out.mkdir(exist_ok=True)
im = Image.new('RGB', (1024, 1024), '#FAF7F1')
d = ImageDraw.Draw(im)
d.rounded_rectangle((170, 150, 854, 874), radius=185, fill='#C42121')
d.polygon([(512, 280), (722, 350), (705, 570), (660, 665), (592, 734), (512, 779), (432, 734), (364, 665), (319, 570), (302, 350)], fill='white')
d.line([(404, 508), (482, 588), (626, 428)], fill='#C42121', width=45, joint='curve')
im.save(out / 'icon.png')
im.resize((64, 64), Image.Resampling.LANCZOS).save(out / 'favicon.png')
im.save(out / 'adaptive-icon.png')
