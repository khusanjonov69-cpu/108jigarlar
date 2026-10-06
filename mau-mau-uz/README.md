# Mau-Mau UZ — Real 3D multiplayer

Bu versiyada personajlar JPG/PNG emas. Render build vaqtida 6 ta haqiqiy rigged `.glb` model yuklanadi va `public/assets/characters/` ichiga joylanadi. Har bir GLB mesh + 22-bone skeleton + animation cliplar bilan keladi.

## Ishga tushirish

Render → New Web Service → Docker:
- Root Directory: `mau-mau-uz`
- Dockerfile Path: `./Dockerfile`
- Docker Build Context: `.`
- Plan: Free

Docker build vaqtida `scripts/download-assets.sh` 6 ta GLB ni olib keladi. Shuning uchun GitHub repo ichida katta binary fayllarni saqlash shart emas, lekin ishlayotgan Render container ichida modellar real fayl sifatida mavjud bo'ladi.

## 3D asset manbasi

`MMWilliams/char-kit` — 16 ta MakeHuman rigged character, har biri o'zining 22-bone rig va 66 animation cliplari bilan keladi. Ushbu loyiha 6 ta modeldan foydalanadi. Manba: https://github.com/MMWilliams/char-kit

MakeHuman/MPFB2 character meshes va bundled assets CC0 sifatida ko'rsatilgan; char-kit README motion capture litsenziyasini alohida tekshirish kerakligini aytadi. Ushbu buildni ommaga tarqatishdan oldin motion-source litsenziyasini qayta tekshiring.

## Muhim

- Server authoritative.
- Oddiy client boshqa o'yinchilarning hand kartalarini olmaydi.
- Secret mode faqat server tasdiqlagan socket holati orqali boshqa handni shu qurilmaga yuboradi.
- 7 stack, 6 non-stack, 8 same-suit continuation, Q suit choice, A skip, draw-then-immediate-play qoidalari serverda bajariladi.
