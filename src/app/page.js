'use client'

export default function Home() {
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center p-4 gap-4">
      <a href="/discounts" className="mx-1 bg-blue-500 hover:bg-blue-700 text-white text-center font-bold min-w-64 py-4 px-4 rounded">
        Discount-uri
      </a>
      <a href="/vama" className="mx-1 bg-blue-500 hover:bg-blue-700 text-white text-center font-bold min-w-64 py-4 px-4 rounded">
        Vama
      </a>
    </main>
  )
}
