1. Clone Repositori

Jalankan perintah berikut untuk menyalin repository ke komputer Anda:

git clone <URL_REPOSITORY_ANDA>

Setelah proses clone selesai, masuk ke folder project:

cd nama-folder-project
2. Jalankan Program

Buka terminal di dalam folder project, lalu jalankan:

npm start

Tunggu hingga server berjalan dengan baik.

3. Akses Endpoint Menggunakan Browser / Postman

Setelah server berjalan, buka browser atau Postman, lalu masukkan URL berikut:

http://localhost:3000/naver?url=https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=iphone&searchMethod=all.basic&isFreshCategory=false&isOriginalQuerySearch=false&isCatalogDiversifyOff=false&listPage=1&categoryIdsForPromotions=50000204&categoryIdsForPromotions=50000205&hiddenNonProductCard=true&hasMoreAd=true&hasMore=true&score=4.8%7C5

Endpoint ini akan memproses data berdasarkan parameter url yang diberikan.
