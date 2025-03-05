// src/app/about/page.tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
      <div className="w-full max-w-[1200px] min-w-[600px] mx-auto bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-4 flex justify-between items-center">
            <h1 className="text-2xl sm:text-3xl font-bold">About OUTRUN CANCER</h1>
          </div>
          
          <div className="space-y-4 sm:space-y-6">
            <p className="text-sm sm:text-base">
            Founded in 2011, OUTRUN CANCER is on a mission to prevent cancer by funding research, raising awareness, and inspiring action. We’ve raised over A$1 million, mobilized thousands, and turned passion into impact.
            </p>
            
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Our Journey</h2>
              <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                <li>
                  <strong>OUTRUN CANCER 1.0 – The Spark (2011–2013)</strong> 
                  <br></br>What began as one person’s fight against the devastation of cancer became a movement. Pushing physical and mental limits, we ran across countries, tackled ultra-marathons, and launched the Corporate Treadmill Marathon, raising $150K to fund groundbreaking cancer prevention research.<br></br><br></br>
                </li>
                <li>
                  <strong>OUTRUN CANCER 2.0 – The Movement (2014–2024)</strong>
                  <br></br>Determined to amplify our impact, we expanded events, forged corporate and charity partnerships, and built an efficient donation platform—raising $1 million for cancer prevention and mobilizing thousands to take action, literally running against cancer.<br></br>
                  <br></br>Just as we reached a tipping point in 2020, COVID-19 brought everything to a halt—an immense personal and financial setback. But setbacks don’t define us. We keep running.
                  <br></br>Between 2021 and 2024, we stayed true to our mission by organizing running charity events under a different banner—keeping the flame alive, learning, and preparing for the next bold step.<br></br><br></br>
                </li>
                <li>
                  <strong>OUTRUN CANCER 3.0 – The Future (2025)</strong> 
                  <br></br>We are evolving—pioneering the intersection of technology, running, and charity. Our vision: a blockchain-powered platform that empowers the community to take control. Transparent donations, self-sustaining charity events, and a system that maximizes impact without wasting resources.<br></br><br></br>
                  With Web 3.0 on the verge of mass adoption, people demand full transparency and the power to drive real change. This is our moment—to bring together everything we’ve learned and built over the last decade, to revolutionize fundraising, and to outrun cancer together.
                  If not us, who? If not now, when?
                </li>
              </ul>
            </div>
            <br></br>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">The Angels Board</h2>
              <p className="text-sm sm:text-base">
              The Angels Board is how we bootstrap our project—and how you can be part of it.

By securing your spot on our digital board, forever on our page and the blockchain, you’re directly funding the development of Outruncancer 3.0. You become one of our OG Angel investors, backing a movement that could one day save your life or that of someone you love.<br></br><br></br>
              </p>
              <div className="mt-4">
                <Link href="/angels-board">
                  <Button className="bg-[#004E32] hover:bg-[#003D27]">
                    Visit the Angels' Board
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}