# MD Bilet – Makine Dairesi Arıza & Bakım

Gemi makine dairesi için çevrimdışı öncelikli bir bilet prototipidir. Düz HTML, CSS ve JavaScript ile yazılmış bir PWA’dır; sunucu tarafı yoktur. Biletler, ekipman ağacı, yedek parça stoğu ve senkron kuyruğu tarayıcıda IndexedDB’de durur. Service worker ilk açılıştan sonra uygulamanın internet olmadan çalışmasını sağlar.

**Canlı adres:** https://ygtekr.github.io/engine-ticket-prototype/

## Ne yapar

- SFI ekipman ağacı (ana makine, jeneratör, kazan, seperatör, pompa, vana) ve her ekipman için QR etiketi
- Kamera, fotoğraf veya manuel seçimle QR okuma
- Arıza ve bakım bileti açma; sıkıştırılmış fotoğraf ve kısa ses kaydı
- Rol akışı: Yağcı ile 3. ve 4. Çarkçı açar ve işi bitirir, 2. Çarkçı atar, Çarkçıbaşı onaylayıp kapatır
- Yedek parça stoğu; bilet kapanınca stoktan düşme
- Çevrimdışı değişiklik kuyruğu ve simüle senkron
- Aynı ekipman ve benzer arıza metnine göre basit geçmiş önerisi

## Yerelde çalıştırma

Dosyalar depo kökündedir. Kökten bir statik sunucu yeter:

```bash
python3 -m http.server 8080
```

Tarayıcıda http://localhost:8080 adresini açın. Kamera ile QR okuma ve ana ekrana kurulum için HTTPS gerekir; yukarıdaki GitHub Pages adresi bunu sağlar.

## Yayın

`main` dalına her gönderimde `.github/workflows/pages.yml` depo kökünü GitHub Pages’e yükler. Site `/engine-ticket-prototype/` alt yolunda yayınlandığı için sayfa, manifest (`start_url`, `scope`) ve service worker kayıt yolu görelidir.
