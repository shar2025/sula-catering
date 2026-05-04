// Sula Indian Restaurant knowledge corpus, ingested from sulaindianrestaurant.com
// on 2026-05-02 via read-only Chrome crawl (per-instance permission granted by Shar).
//
// Sources:
// , JSON-LD `Restaurant` schema on each per-location page (canonical for
//   address, hours, phone, rating, menu URL).
// , JSON-LD `FAQPage` schema on /locations, /catering-vancouver, /party-catering,
//   /indian-food-delivery-vancouver, and the three per-location pages.
// , Plain-HTML FAQ accordion on /contact (5 dietary, takeout, spice questions).
//
// At runtime this is concatenated onto POLICIES + PUBLIC + BUYOUT inside
// api/neela.ts so it shares the existing fourth cache_control breakpoint
// (Anthropic caps at 4: persona / site / forms / policies+public+buyout+restaurant).
//
// Voice rule: em/en dashes in source content normalized to commas so Neela
// doesn't mirror them in her replies.
//
// Update process: re-run the crawl, regenerate this file, bump
// RESTAURANT_KNOWLEDGE_VERSION, redeploy. First request after deploy rebuilds
// the merged-block cache.

export const RESTAURANT_KNOWLEDGE_VERSION = '2026-05-03-2';

export interface RestaurantLocation {
	name: string;
	slug: string;
	address: string;
	postalCode: string;
	phone: string;
	hours: string;
	hoursDetail: string;
	rating: { value: string; reviewCount: string };
	menuUrl: string;
	notes: string;
}

export interface RestaurantFaq {
	category: string;
	page: string;
	q: string;
	a: string;
}

export interface RestaurantPageFact {
	url: string;
	title: string;
	h1: string;
	summary: string;
}

export const RESTAURANT_KNOWLEDGE = {
	source: 'sulaindianrestaurant.com',
	crawledAt: '2026-05-02',
	pagesCrawled: 32,
	pages404: ['/faq', '/about'],

	locations: [
		{
			name: 'Sula Indian Restaurant, Commercial Drive (flagship)',
			slug: 'commercial-drive',
			address: '1128 Commercial Drive, Vancouver, BC V5L 3X2',
			postalCode: 'V5L 3X2',
			phone: '604-265-7493',
			hours:
				'Mon to Wed 11:00 AM to 11:00 PM, Thu 11:00 AM to 11:40 PM, Fri 11:00 AM to 11:45 PM, Sat 10:30 AM to 11:45 PM, Sun 10:30 AM to 9:30 PM',
			hoursDetail:
				'Indoor dining typically ends 30 to 60 minutes before close. Takeout and home delivery: Mon to Thu until 11:00 PM, Fri to Sat until 11:45 PM, Sun until 9:30 PM. Brunch Sat and Sun 10:30 AM to 2:30 PM.',
			rating: { value: '4.4', reviewCount: '2795' },
			menuUrl: 'https://sulaindianrestaurant.com/sula-menu/indian-restaurant-menus-vancouver/',
			notes:
				'Original 2010 location, heritage-inspired, garden-like atmosphere with hand-carved wooden doors. Known for 50+ curries, including coastal specialties from Kerala, Goa, and Karnataka. Hosts up to 30 guests for private group dining.'
		},
		{
			name: 'Sula Indian Restaurant, Main Street (Riley Park)',
			slug: 'main-street',
			address: '4172 Main Street, Vancouver, BC V5V 3P7',
			postalCode: 'V5V 3P7',
			phone: '778-718-4409',
			hours:
				'Mon to Thu 11:00 AM to 10:00 PM, Fri to Sat 11:00 AM to 10:30 PM, Sun 11:00 AM to 9:30 PM',
			hoursDetail:
				'Takeout and delivery: Mon to Thu 11:30 AM to 11:00 PM, Fri to Sat 11:30 AM to 11:45 PM, Sun 11:30 AM to 9:30 PM.',
			rating: { value: '4.4', reviewCount: '2714' },
			menuUrl:
				'https://sulaindianrestaurant.com/sula-menu/indian-restaurant-menu-main-street-vancouver/',
			notes:
				'Riley Park / Mount Pleasant. Bright, art-filled rustic dining room. Indian street food (Tandoori Momos, Railway Vada Pav, Sev Puri), award-winning cocktail program by Jeff Savage (Makara Highball, Spicy Laguna Lime). Halal-friendly. Hosts up to 20 guests for private dining.'
		},
		{
			name: 'Sula Indian Restaurant, Davie Street (Downtown / West End)',
			slug: 'davie-street',
			address: '1708 Davie Street, Vancouver, BC V6G 2K7',
			postalCode: 'V6G 2K7',
			phone: '778-663-5433',
			hours:
				'Mon to Wed 11:00 AM to 10:00 PM, Thu 11:00 AM to 10:30 PM, Fri to Sat 11:00 AM to 11:00 PM, Sun 10:30 AM to 9:30 PM',
			hoursDetail:
				'Takeout and home delivery: Mon to Thu 11:30 AM to 11:00 PM, Fri to Sat 11:30 AM to 11:45 PM, Sun 11:30 AM to 9:30 PM. Weekend brunch starts at 10:30 AM Sat and Sun.',
			rating: { value: '4.3', reviewCount: '681' },
			menuUrl: 'https://sulaindianrestaurant.com/sula-menu/indian-food-menu-downtown-vancouver/',
			notes:
				"Steps from English Bay. Modern fusion concept. Exclusive Spice Route Tasting Menu 2.0 ($48 per person, optional wine pairing +$30, minimum two guests, complete table participation required). Hosts up to 20 guests for private dining. Won Gold for Best Indian Restaurant at 2025 Georgia Straight Golden Plates and Gold for Best Indian + Bronze for Best Chain at 2025 Vancouver Magazine Awards."
		},
		{
			name: 'Sula Cafe',
			slug: 'cafe',
			address: '260 East 5th Avenue, Vancouver, BC V5T 1H3',
			postalCode: 'V5T 1H3',
			phone: '778-386-1130',
			hours: 'Mon to Fri 8:00 AM to 5:30 PM, Sat to Sun 9:00 AM to 5:30 PM',
			hoursDetail:
				'Takeout-focused cafe. Address, phone, and hours verified 2026-05-03 from sulacafe.com JSON-LD CafeOrCoffeeShop schema and visible footer. Not republished on the sulaindianrestaurant.com WordPress site.',
			rating: { value: '', reviewCount: '' },
			menuUrl: '',
			notes:
				'Newest concept. Specializes in traditional Sula chai, Alai coffee, Indian-inspired paninis on house-made masala focaccia (in partnership with Union Market), and Indian-inspired baked goods. Replaced LAtelier Patisserie. Cafe entrance is under a sign with a monkey enjoying a warm drink.'
		}
	] as RestaurantLocation[],

	awards: [
		{
			year: '2025',
			award: 'Vancouver Magazine Restaurant Awards, GOLD, Best Indian Restaurant',
			location: 'Davie Street',
			notes: 'Cited "sense of confidence, ambitious menu that doesnt shy away from big, uncompromising flavours"'
		},
		{
			year: '2025',
			award: 'Vancouver Magazine Restaurant Awards, BRONZE, Best Chain',
			location: 'Sula (chain-wide)'
		},
		{
			year: '2025',
			award: 'Georgia Straight Golden Plates, GOLD, Best Indian Restaurant',
			location: 'Davie Street and Main Street'
		},
		{
			year: 'consistent',
			award: "OpenTable Diner's Choice",
			location: 'all locations'
		},
		{
			year: 'cumulative',
			award: '16+ awards over 15+ years',
			location: 'per sulaindianrestaurant.com/list-of-awards meta description'
		}
	],

	cuisineHighlights: {
		signatureDishes: [
			'Butter Chicken',
			'Lamb Biryani',
			'Lamb Rogan Josh',
			'Tandoori Murg Tikke',
			'Paneer Makhani',
			'Channa Saag',
			'Dal Makhani',
			'Hyderabadi Biryani',
			'Vegan Dal Makhani',
			'Chana Masala',
			'Aloo Gobi',
			'Tandoori Momos',
			'Railway Vada Pav',
			'Sev Puri',
			'Samosa Chaat'
		],
		mothergravies:
			'Six signature mother gravies prepared from scratch daily, flash-finished with house-ground garam masalas and fresh aromatic herbs. Allows 50+ different curries across regional styles (North Indian, Goa, Kerala, Karnataka, Mangalore).',
		veganNaan:
			'Sula is one of the few Indian restaurants in Vancouver to offer vegan naan, made with coconut cream and a unique strain of yeast. Dedicated vegan menu across all three full-service locations.',
		halal:
			'All chicken and lamb is halal-certified, sourced from trusted local BC suppliers. Halal-certified by default since 2010 across catering and restaurants.',
		spiceLevel: 'Most dishes can be prepared mild, medium, or spicy on request.',
		glutenFriendly:
			'Many curries and tandoori dishes are naturally gluten-friendly. Naan and a few specific items contain gluten. Gluten-free missi roti available on request for catering.'
	},

	cateringSummary: {
		serviceArea: ['Vancouver', 'Burnaby', 'Richmond', 'Surrey', 'North Vancouver', 'West Vancouver'],
		minimumGuests: 'No published off-site catering minimum on the public site, but the SULA POLICIES block has the 15-guest minimum for off-site delivery; smaller groups route to in-restaurant group dining or Sula Cafe.',
		leadTime:
			'2 to 3 weeks recommended for corporate events, 4 to 6 weeks for weddings and large private parties.',
		partyPackages: {
			twoCurry: '$21.95 per person (2 curries with rice, naan, chutneys)',
			premium: '$23.95 to $29.95 per person (appetizers + multiple curries)',
			vegetarianVegan: '$22.95 per person (2 vegetarian + 2 vegan curries)',
			addons: '$3 to $11 per person (desserts, extra curries, tandoori items)',
			dinnerware: '$6.90 per person',
			aluminiumTrays: 'free',
			groupSize: '10 to 600 guests'
		},
		featuredCateringDishes: [
			'Hyderabadi Biryani',
			'Butter Chicken',
			'Dal Makhani',
			'Tandoori Murg Tikke',
			'Paneer Makhani',
			'Channa Saag',
			'Samosa Chaat',
			'Tandoori Momos',
			'Railway Vada Pav Sliders'
		],
		eventTypes: [
			'weddings',
			'corporate office lunches',
			'private parties (birthdays, anniversaries, engagements, family reunions, housewarming, graduation)',
			'tour groups visiting Vancouver'
		],
		setup: 'Full setup with elegant wooden or hammered copper food displays, heated delivery trucks, complete cleanup. VCH-approved kitchens at all three restaurant locations.',
		quoteRequest:
			'Quote requests via sulaindianrestaurant.com/catering. Provide event date, guest count, location, dietary requirements; team responds within 24 hours.'
	},

	delivery: {
		flatFee: '$5 flat delivery fee when ordering directly from sulaindianrestaurant.com (no third-party markup)',
		minimumOrder: '$35 minimum order',
		radius:
			'8 km radius from each of the three Vancouver locations (Commercial Drive, Main Street, Davie Street). Covers East Vancouver, Strathcona, Mount Pleasant, Riley Park, and the Downtown West End.',
		bestForDelivery:
			'Rich, thick gravies travel best (Butter Chicken, Dal Makhani, Saag Paneer, Chicken Tikka Masala). Dry tandoori items can dry out in transit.',
		veganDelivery:
			'Dedicated vegan section for delivery: Vegan Dal Makhani, Chana Masala, Aloo Gobi, vegan naan options.'
	},

	happyHour: {
		commercialDrive: 'Mon to Fri 2:30 PM to 5:30 PM, Sat and Sun 2:30 PM to 5:00 PM',
		general: 'Daily 2:30 PM to 5:00 PM (per site banner). Discounted Indian street food and signature cocktails (Spicy Laguna Lime).'
	},

	brunch: {
		commercialDrive: 'Sat and Sun 10:30 AM to 2:30 PM',
		davieStreet: 'Sat and Sun starting 10:30 AM',
		menuStyle: 'Indian twist on traditional brunch favourites with local ingredients.'
	},

	tastingMenu: {
		name: 'Spice Route Tasting Menu 2.0',
		location: 'Davie Street ONLY',
		price: '$48 per person',
		winePairing: '+$30 (3 oz each)',
		rules: 'Minimum two guests, complete table participation required.'
	},

	publicContacts: {
		cateringEmail: 'events.sula@gmail.com',
		generalInfo: 'info@sulaindianrestaurant.com',
		eventsPhone: '778-663-5433 (referenced on /party-catering for events enquiries)'
	},

	faqs: [
		// LOCATIONS (10)
		{
			category: 'locations',
			page: '/locations',
			q: 'How many Sula Indian Restaurant locations are there in Vancouver?',
			a: 'There are three full-service Sula Indian Restaurant locations: Commercial Drive (the flagship), Main Street (Riley Park), and Davie Street (Downtown). Sula also operates Sula Cafe on East 5th Ave, which specializes in traditional chai, Alai coffee, and Indian-inspired baked goods.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'What is unique about the Sula Indian Restaurant on Commercial Drive?',
			a: 'Located at 1128 Commercial Drive, this is Sulas original flagship location. It is famous for its heritage roots and an extensive menu featuring over 50 thoughtfully prepared curries, a go-to for North Indian classics and vibrant coastal specialties from Kerala, Karnataka, and Goa.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'Where is Sula Indian Restaurant located on Main Street?',
			a: 'Sula Main Street is at 4172 Main Street in the Riley Park neighborhood. It offers the same award-winning regional flavours and hospitality as the original location, a favourite social dining spot for South Vancouver.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'Is there a Sula Indian Restaurant in Downtown Vancouver?',
			a: 'Yes, Sulas third location is at 1708 Davie Street, serving the Downtown and West End. It provides convenient access for locals and tourists, with signature cocktails and traditional recipes like Butter Chicken and Tandoori Murg Tikke in a modern urban setting.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'What does Sula Cafe offer compared to the main restaurants?',
			a: 'Sula Cafe at 260 East 5th Ave offers a curated experience focused on traditional Sula chai and Alai coffee. Unlike the full-service restaurants, the cafe features Indian-inspired paninis on house-made masala focaccia, street food, and unique baked goods, perfect for a quick lunch or specialty coffee break.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'Does Sula Cafe partner with any local bakeries for its menu?',
			a: 'Yes, Sula Cafe features gourmet Indian-inspired paninis crafted in partnership with Union Market. The paninis use a signature house-made masala focaccia, blending Italian-style bread with bold Indian spices.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'Are the menus the same at all Sula Indian Restaurant locations?',
			a: 'All three main locations (Commercial Drive, Main, Davie) offer Sulas award-winning 50+ curries and signature hospitality. Each location has its own neighborhood vibe but shares the same commitment to traditional regional flavours from North India and the coastal regions.'
		},
		{
			category: 'locations',
			page: '/locations',
			q: 'Can I book a table for a large group at Sula locations?',
			a: 'Absolutely. All Sula locations (Commercial Drive, Main Street, and Davie Street) are equipped to host large group reservations and special events. Enquire about group bookings directly through the website for any of the three restaurants.'
		},
		{
			category: 'hours',
			page: '/locations',
			q: 'What are the operating hours for Sula Indian Restaurants?',
			a: 'Sula locations are generally open Monday to Thursday and Sunday from 11:00 AM to 10:00 PM, with extended hours on Friday and Saturday until 10:30 PM. Per-location hours vary, see the canonical schema in this knowledge corpus for exact times.'
		},
		{
			category: 'menu',
			page: '/locations',
			q: 'Does Sula offer coastal Indian specialties at all its locations?',
			a: 'Yes. Sulas menu includes authentic coastal specialties from Goa, Kerala, and Karnataka alongside traditional North Indian dishes, regardless of which Vancouver location you visit.'
		},

		// COMMERCIAL DRIVE (9)
		{
			category: 'locations',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'Where is Sula Indian Restaurant located on Commercial Drive?',
			a: "Sulas flagship is at 1128 Commercial Drive, Vancouver, in the heart of East Vancouver. The heritage-inspired location is known for its cozy, garden-like atmosphere and has been a cornerstone of the Commercial Drive dining scene since 2010."
		},
		{
			category: 'dietary-vegan',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'Does Sula on Commercial Drive offer vegan-friendly naan?',
			a: 'Yes. Sula is one of the few Indian restaurants in Vancouver to offer vegan naan, made with coconut cream and a unique strain of yeast. There is also a dedicated vegan menu featuring regional curries.'
		},
		{
			category: 'menu',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'What makes the curries at Sula Commercial Drive unique?',
			a: 'The culinary team prepares six signature mother gravies daily from scratch, flash-finished with house-ground garam masalas and fresh aromatic herbs. This traditional technique allows over 50 different curries, from North Indian classics to coastal specialties from Kerala, Goa, and Karnataka.'
		},
		{
			category: 'private-events',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'Can I host a private event or large group at the Commercial Drive location?',
			a: 'Yes. Sula Commercial Drive comfortably accommodates groups of up to 30 guests, with flexible dining options and custom menus for celebrations, corporate lunches, or family gatherings.'
		},
		{
			category: 'brunch',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'Does Sula Commercial Drive serve Indian Brunch?',
			a: 'Yes. Indian Brunch is served every Saturday and Sunday from 10:30 AM to 2:30 PM, with a unique twist on traditional morning favourites blending classic Indian flavours with fresh local ingredients.'
		},
		{
			category: 'happy-hour',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'When is Happy Hour at Sula on Commercial Drive?',
			a: 'Happy Hour daily: Monday to Friday 2:30 PM to 5:30 PM, Saturday and Sunday 2:30 PM to 5:00 PM. Discounted Indian street food and signature cocktails like the Spicy Laguna Lime in the heritage-inspired dining room.'
		},
		{
			category: 'atmosphere',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'What is the atmosphere like at Sulas East Vancouver restaurant?',
			a: 'The Commercial Drive location is cozy and heritage-inspired, decorated with hand-carved wooden doors and earthy tones, creating a lush, garden-like setting. Widely considered one of the most atmospheric Indian dining spots in Vancouver.'
		},
		{
			category: 'hours',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'What are the late-night dining hours for Sula on Commercial Drive?',
			a: 'Sula Commercial Drive offers extended hours: Monday to Wednesday until 11:00 PM, Thursday until 11:40 PM, Friday and Saturday until 11:45 PM. On Sundays, close at 9:30 PM.'
		},
		{
			category: 'awards',
			page: '/indian-restaurant-commercial-drive-vancouver',
			q: 'Has Sula Commercial Drive won any recent awards?',
			a: "Yes. Sula was named Best Indian Restaurant by Vancouver Magazine in 2025 and consistently earns the OpenTable Diner's Choice award."
		},

		// MAIN STREET (9)
		{
			category: 'locations',
			page: '/indian-restaurant-main-street',
			q: 'Where is Sula Indian Restaurant located on Main Street, Vancouver?',
			a: 'Sula Main Street is at 4172 Main Street, Vancouver, in the Riley Park neighborhood. A favourite for those seeking a mix of traditional heritage recipes and a modern Indian cocktail bar experience.'
		},
		{
			category: 'menu',
			page: '/indian-restaurant-main-street',
			q: 'Does the Main Street location serve authentic Indian Street Food?',
			a: 'Yes. Sula Main Street is known for its selection of Indian street food including Tandoori Momos, Railway Vada Pav, and Sev Puri.'
		},
		{
			category: 'cocktails',
			page: '/indian-restaurant-main-street',
			q: 'What kind of cocktails does Sula on Main Street offer?',
			a: 'Sula Main Street features a creative cocktail program curated by award-winning mixologist Jeff Savage. Indian-inspired spirits and botanicals, including the Makara Highball and Spicy Laguna Lime.'
		},
		{
			category: 'dietary-halal',
			page: '/indian-restaurant-main-street',
			q: 'Is the meat served at Sula Main Street Halal?',
			a: 'Yes. The Main Street location offers halal-friendly Indian food options, with a diverse menu accommodating various dietary preferences while staying rooted in North Indian and coastal Mangalore flavours.'
		},
		{
			category: 'dietary-vegan',
			page: '/indian-restaurant-main-street',
			q: 'Can I get vegan naan at Sulas Main Street location?',
			a: 'Yes. There is a dedicated vegan Indian menu, and traditional naans can be made vegan on request using coconut cream and a unique yeast strain.'
		},
		{
			category: 'awards',
			page: '/indian-restaurant-main-street',
			q: 'What awards has Sula Main Street recently won?',
			a: 'In 2025, Sula Main Street was awarded Gold for Best Indian Restaurant in the Georgia Straight Golden Plates Awards and earned a Bronze for Best Chain from Vancouver Magazine.'
		},
		{
			category: 'private-events',
			page: '/indian-restaurant-main-street',
			q: 'Does Sula Main Street accommodate group reservations or private events?',
			a: 'Yes. Sula Main Street is suitable for group dining and private events such as birthdays or business lunches, accommodating gatherings of up to 20 guests in the bright, art-filled rustic dining room.'
		},
		{
			category: 'menu',
			page: '/indian-restaurant-main-street',
			q: 'Are there coastal Indian dishes available on the Main Street menu?',
			a: 'Yes. Sula Main Street celebrates regional diversity with dishes inspired by coastal Mangalore alongside traditional North Indian favourites. Every dish is crafted using one of the six signature mother gravies prepared fresh daily.'
		},
		{
			category: 'hours',
			page: '/indian-restaurant-main-street',
			q: 'What are the hours at Sula Main Street?',
			a: 'Sula Main Street is open for indoor dining Monday through Thursday 11:00 AM to 10:00 PM, Friday and Saturday 11:00 AM to 10:30 PM, Sunday 11:00 AM to 9:30 PM. Takeout and home delivery is available later: until 11:00 PM Mon to Thu and until 11:45 PM Fri to Sat.'
		},

		// DAVIE STREET (10)
		{
			category: 'locations',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'Where is Sula Indian Restaurant located in Downtown Vancouver?',
			a: 'Sula Davie Street is at 1708 Davie Street, Vancouver, in the heart of the West End. Perfectly situated for premium Indian dining near English Bay or in the downtown Vancouver core.'
		},
		{
			category: 'menu',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'Does Sula Davie Street offer a specialized Tasting Menu?',
			a: "Yes. The Davie Street location exclusively offers a Spice Route Tasting Menu, a curated culinary journey featuring India's most celebrated regional cuisines. $48 per person, optional wine pairing +$30, minimum two guests with complete table participation required."
		},
		{
			category: 'awards',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'What awards has the Sula Downtown location received?',
			a: 'Sula Davie Street won Gold for Best Indian Restaurant at the 2025 Georgia Straight Golden Plates Awards. It also earned Gold for Best Indian and Bronze for Best Chain at the 2025 Vancouver Magazine Awards.'
		},
		{
			category: 'atmosphere',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'Is Sula Davie Street considered a good spot for a date night or work dinner?',
			a: 'Yes. The Davie Street location features a modern, inviting space blending contemporary elegance with traditional warmth. Recommended for date nights near the beach, work dinners, and special celebrations in the West End.'
		},
		{
			category: 'dietary-vegan',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'Does Sula Davie Street offer vegan and vegetarian Indian food?',
			a: 'Yes. Sula Downtown offers an extensive menu of vegan and vegetarian Indian dishes, from plant-based share plates to rich, slow-simmered curries.'
		},
		{
			category: 'private-events',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: "Can I host a private event at Sula's West End location?",
			a: 'Yes. Sula Davie Street accommodates group dining and private events for up to 20 guests. Suitable for birthdays, corporate lunches, or intimate holiday parties in a sophisticated downtown environment.'
		},
		{
			category: 'menu',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'What are the signature dishes at Sula Davie Street?',
			a: 'Beyond the exclusive tasting menu, popular dishes include signature Butter Chicken, fragrant Lamb Biryani, and coastal-inspired seafood curries. Every dish is reimagined with a modern flair while staying rooted in authentic heritage recipes.'
		},
		{
			category: 'family',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'Is Sula Davie Street a family-friendly restaurant?',
			a: 'Yes. Sula offers a relaxed yet flavourful atmosphere perfect for families looking to share a traditional Indian meal after a walk along English Bay.'
		},
		{
			category: 'hours',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'What are the opening hours for Sula on Davie Street?',
			a: 'Sula Davie Street is open Monday to Wednesday until 10:00 PM, Thursday until 10:30 PM, Friday to Saturday until 11:00 PM. Sunday service ends at 9:30 PM. Weekend brunch starts at 10:30 AM.'
		},
		{
			category: 'catering',
			page: '/indian-restaurant-downtown-vancouver-davie-street',
			q: 'Does Sula Davie Street offer catering for corporate events in Downtown Vancouver?',
			a: "Yes. Corporate Indian catering and private party catering throughout the downtown core is offered, bringing Sula's award-winning flavours to offices, weddings, or private events with tailored menus and professional service."
		},

		// CATERING (12)
		{
			category: 'catering',
			page: '/catering-vancouver',
			q: 'What types of events does Sula Indian Restaurant cater in Vancouver?',
			a: 'Professional Indian catering for weddings, corporate office lunches, private parties, birthdays, and tour groups of all sizes across Vancouver and the Lower Mainland.'
		},
		{
			category: 'dietary-halal',
			page: '/catering-vancouver',
			q: 'Does Sula offer halal and vegan catering options?',
			a: 'Yes. All meat is halal-certified, and there is an extensive selection of vegan and vegetarian Indian dishes to ensure all event guests are accommodated.'
		},
		{
			category: 'service-area',
			page: '/catering-vancouver',
			q: 'Which areas do you deliver catering to in the Lower Mainland?',
			a: 'Sula provides reliable catering delivery to Vancouver, Burnaby, Richmond, Surrey, North Vancouver, and West Vancouver.'
		},
		{
			category: 'catering',
			page: '/catering-vancouver',
			q: 'Can I customize the catering menu for my wedding or party?',
			a: 'Absolutely. Fully customizable menus featuring regional specialties like Hyderabadi Biryani, South Indian street food, and North Indian mother gravies, tailored to specific event needs.'
		},
		{
			category: 'catering',
			page: '/catering-vancouver',
			q: 'Do you provide full-service catering or just delivery?',
			a: 'Both. Choose from professional full-service buffet setups, plated meal service, or convenient catering delivery with samosa platters and finger food packages.'
		},
		{
			category: 'lead-time',
			page: '/catering-vancouver',
			q: 'How far in advance should I book Sula for catering in Vancouver?',
			a: 'At least two to three weeks in advance for corporate events and four to six weeks for weddings and large private parties. Allows time to source premium ingredients and tailor the menu.'
		},
		{
			category: 'catering',
			page: '/catering-vancouver',
			q: 'What is the minimum guest count for Sula catering?',
			a: 'Sula catering serves events of all sizes, from intimate gatherings of 10 guests to large corporate functions and weddings with several hundred attendees. (Note: SULA POLICIES block has the 15-guest off-site delivery minimum that overrides this for delivery-style catering; smaller groups route to in-restaurant or Sula Cafe.) Contact directly to discuss specific requirements.'
		},
		{
			category: 'catering',
			page: '/catering-vancouver',
			q: 'Does Sula cater Indian food for corporate office lunches in Vancouver?',
			a: 'Yes. Office catering packages include individually portioned meals, shared thali platters, and samosa finger food trays, ideal for team lunches, client meetings, and company celebrations across Vancouver, Burnaby, and the Lower Mainland.'
		},
		{
			category: 'wedding',
			page: '/catering-vancouver',
			q: 'Can Sula cater an Indian wedding in Vancouver?',
			a: 'Yes. Indian wedding catering is a specialty. Curated multi-course menus feature North Indian classics like Butter Chicken and Lamb Biryani alongside South Indian and coastal dishes, with the team honoring cultural traditions and dietary requirements.'
		},
		{
			category: 'menu',
			page: '/catering-vancouver',
			q: 'What signature dishes are popular for Sula catering events?',
			a: 'Most requested catering dishes include Hyderabadi Biryani, Butter Chicken, Dal Makhani, Tandoori Murg Tikke, Paneer Makhani, and Channa Saag. Crowd-pleasing starters include Samosa Chaat, Tandoori Momos, and Railway Vada Pav Sliders.'
		},
		{
			category: 'catering',
			page: '/catering-vancouver',
			q: 'Does Sula Indian Restaurant offer catering for tour groups visiting Vancouver?',
			a: 'Yes. Sula regularly caters for international tour groups visiting Vancouver, accommodating large group bookings across all three restaurant locations or providing off-site catering for group itineraries.'
		},
		{
			category: 'quote',
			page: '/catering-vancouver',
			q: 'How do I get a catering quote from Sula Indian Restaurant?',
			a: 'Request a catering quote directly through sulaindianrestaurant.com/catering. Provide event date, guest count, location, and any dietary requirements; the catering team responds within 24 hours with a tailored proposal.'
		},

		// PARTY CATERING (6)
		{
			category: 'pricing',
			page: '/party-catering',
			q: 'How much does private party catering from Sula cost?',
			a: 'Private party catering packages start from $21.95 per person for a 2-curry meal with rice, naan, and chutneys. Premium options with appetizers and multiple curries range from $23.95 to $29.95 per person. Add-ons like desserts, extra curries, and tandoori items are available from $3 to $11 per person.'
		},
		{
			category: 'private-events',
			page: '/party-catering',
			q: 'What types of private parties does Sula cater?',
			a: 'Sula caters birthdays, anniversaries, engagements, family reunions, housewarming parties, graduation celebrations, and any private gathering. Groups from 10 to 600 guests at home or venue across Vancouver, Burnaby, Richmond, West Vancouver, and the North Shore.'
		},
		{
			category: 'setup',
			page: '/party-catering',
			q: 'Does Sula provide setup and cleanup for private parties?',
			a: 'Yes. Catering service includes full setup with elegant wooden or hammered copper food displays, heated delivery trucks, and complete cleanup. Dinnerware is $6.90 per person and aluminium trays are free.'
		},
		{
			category: 'dietary-vegan',
			page: '/party-catering',
			q: 'Does Sula offer vegan and halal options for party catering?',
			a: 'Yes. Menus are halal-certified and there is a dedicated Vegetarian and Vegan package at $22.95 per person with 2 vegetarian and 2 vegan curries. Gluten-free missi roti is available on request across all packages.'
		},
		{
			category: 'private-events',
			page: '/party-catering',
			q: "Can I host a private party at one of Sula's restaurants?",
			a: 'Yes. All three Sula locations (Commercial Drive, Main Street, Davie Street) offer private dining and full restaurant buyout options. Contact events.sula@gmail.com or call 778-663-5433 to enquire about availability.'
		},
		{
			category: 'service-area',
			page: '/party-catering',
			q: 'Where does Sula deliver party catering in Greater Vancouver?',
			a: 'Private party catering is delivered across Vancouver, Burnaby, Richmond, West Vancouver, and the North Shore. Three VCH-approved kitchens on Commercial Drive, Main Street, and Davie Street provide reliable coverage.'
		},

		// DELIVERY (6)
		{
			category: 'delivery',
			page: '/indian-food-delivery-vancouver',
			q: 'What is the best Indian food delivery in Vancouver?',
			a: 'Sula Indian Restaurant is frequently cited as the best Indian food delivery in Vancouver, offering direct ordering with a flat $5 fee. Award-winning Butter Chicken, Lamb Rogan Josh, and authentic regional curries delivered fresh from Commercial Drive, Main Street, and Davie Street.'
		},
		{
			category: 'delivery',
			page: '/indian-food-delivery-vancouver',
			q: 'How can I order Indian food delivery in Vancouver without extra fees?',
			a: "To avoid third-party markups and high service fees, order delivery directly through Sula's website. Flat $5 delivery fee and no platform price increases, so online prices match the restaurant."
		},
		{
			category: 'dietary-halal',
			page: '/indian-food-delivery-vancouver',
			q: 'Is there a halal Indian restaurant that delivers in Vancouver?',
			a: 'Yes. Sula uses halal-certified meats across all locations and offers direct delivery to most of Vancouver, including Downtown, Riley Park, and East Van.'
		},
		{
			category: 'delivery',
			page: '/indian-food-delivery-vancouver',
			q: "What is Sula's delivery radius and minimum order in Vancouver?",
			a: 'Sula delivers within an 8 km radius of the three Vancouver locations (Commercial, Main, Davie) with a $35 minimum order requirement. Range covers East Vancouver, Strathcona, Mount Pleasant, Riley Park, and the Downtown West End.'
		},
		{
			category: 'delivery',
			page: '/indian-food-delivery-vancouver',
			q: 'Which Indian dishes are best for takeout and delivery?',
			a: 'Dishes with rich, thick gravies (Butter Chicken, Dal Makhani, Saag Paneer, Chicken Tikka Masala) are best for delivery. They maintain their heat and flavor profile better than dry tandoori items in transit.'
		},
		{
			category: 'dietary-vegan',
			page: '/indian-food-delivery-vancouver',
			q: 'Can I order vegan Indian food delivery in Vancouver from Sula?',
			a: 'Yes. There is a dedicated vegan section for delivery, including Vegan Dal Makhani, Chana Masala, and Aloo Gobi, plus vegan naan options for a complete authentic experience at home.'
		},

		// CONTACT PAGE (5, accordion-extracted)
		{
			category: 'dietary-halal',
			page: '/contact',
			q: 'Do you offer Halal Meat?',
			a: 'All chicken and lamb dishes are prepared using halal-certified meats sourced from trusted local BC suppliers.'
		},
		{
			category: 'dietary-vegan',
			page: '/contact',
			q: 'Do you offer a vegan or vegetarian menu options?',
			a: 'Yes. All Sula Indian Restaurant locations offer a dedicated vegetarian and vegan section. Plant-based starters, dairy-free curries, and breads made without animal products.'
		},
		{
			category: 'takeout',
			page: '/contact',
			q: 'Is the same menu available for takeout and delivery?',
			a: 'Yes. The same full menu is available for both takeout and delivery, including vegan, vegetarian, and non-vegetarian options. Indian takeout and delivery service is available for busy evenings or relaxed weekends.'
		},
		{
			category: 'spice-level',
			page: '/contact',
			q: 'Can I customize the spice level of my dish?',
			a: 'Yes. Most dishes can be prepared mild, medium, or spicy to suit your personal preference. Just let the team know when ordering or dining in.'
		},
		{
			category: 'dietary-gluten',
			page: '/contact',
			q: 'Are there gluten-friendly Indian options on the menu?',
			a: 'Many curries and tandoori dishes are naturally gluten-friendly. Whether dining in or ordering takeout in Vancouver, the team is happy to help you choose the right options.'
		}
	] as RestaurantFaq[],

	pageFacts: [
		{
			url: '/locations',
			title: 'Indian Restaurant Vancouver | Sula',
			h1: 'Commercial Drive, Main Street and Davie Street Vancouver',
			summary:
				'Hub for all three full-service locations plus the cafe. Authentic Indian food, flavorful curries, tandoori, biryani, vegetarian options.'
		},
		{
			url: '/sula-menu',
			title: 'Sula Indian Restaurant Menus | Commercial Drive, Main, Davie',
			h1: 'Explore Sula Indian Restaurant Menus',
			summary: 'Index of menus for the three full-service locations.'
		},
		{
			url: '/catering-vancouver',
			title: 'Indian Catering Vancouver | Sula',
			h1: 'Indian Catering Services in Vancouver, Weddings, Corporate and Private Events',
			summary:
				'Catering hub. Wedding, corporate, and private party menus from $21.95 per person serving Vancouver and the Lower Mainland.'
		},
		{
			url: '/corporate-catering',
			title: 'Corporate Indian Catering Vancouver | Sula',
			h1: 'Office and Corporate Catering In Vancouver, Burnaby, Richmond and Northshore',
			summary: 'Office lunches, meeting catering, corporate events. Professional service from $21.95 per person.'
		},
		{
			url: '/wedding-catering',
			title: 'Wedding Catering Vancouver | Sula',
			h1: 'Wedding catering by Sula Indian Restaurant',
			summary:
				'Wedding-specific landing page. Multi-course Indian wedding catering with North + South + coastal dishes.'
		},
		{
			url: '/party-catering',
			title: 'Private Party Catering in Vancouver by Sula Indian Restaurant',
			h1: 'Private Party Catering by Sula Indian Restaurant',
			summary:
				'Private party catering with halal and vegan options. Verified pricing tiers $21.95 to $29.95 per person.'
		},
		{
			url: '/reservations',
			title: 'Book Table | Sula Indian Restaurant Locations, Vancouver',
			h1: 'Reserve your table at Sula Indian Restaurant',
			summary: 'Online booking for Commercial Drive, Main Street, or Davie Street.'
		},
		{
			url: '/group-reservations-and-restaurant-buy-out',
			title: 'Private Dining and Group Events | Sula',
			h1: 'Private Dining, Group Reservations and Restaurant Buyouts at Sula',
			summary: 'Group celebrations and full restaurant buyouts. Elegant spaces, custom menus.'
		},
		{
			url: '/sula-davie-tasting-menu',
			title: 'Spice Route Tasting Menu 2.0, Sula Indian Restaurant',
			h1: 'Spice Route Tasting Menu 2.0',
			summary: '$48 per person, optional wine pairing +$30 (3 oz each). Minimum two guests, complete table participation required. Davie Street only.'
		},
		{
			url: '/daily-specials',
			title: 'Daily Specials, Sula Indian Restaurant',
			h1: 'Daily Specials',
			summary: 'Today\'s chef picks and limited-time offers.'
		},
		{
			url: '/photo-gallery',
			title: 'Photo Gallery | Sula Indian Restaurant Vancouver',
			h1: 'Moments at Sula',
			summary: 'Browse photos of food, cocktails, and dining at the three Vancouver locations.'
		},
		{
			url: '/sula-gift-cards-and-loyalty',
			title: 'Sula Gift Cards and Loyalty Program',
			h1: 'Sula E-Gift and Loyalty Card',
			summary: 'Free food delivery under Sula loyalty program. E-gift card purchases.'
		},
		{
			url: '/contact',
			title: 'Contact Sula Indian Restaurant Vancouver BC',
			h1: 'Hours of Operation and Contact Details',
			summary: 'Per-location indoor dining and takeout hours, plus 5 dietary FAQs (halal, vegan, takeout, spice, gluten).'
		},
		{
			url: '/brunch-vancouver',
			title: 'Brunch Restaurant in Vancouver, Sula Indian Restaurant',
			h1: 'Sula Brunch Menu',
			summary: 'Indian-inspired brunch dishes Sat and Sun. Menu varies by location.'
		},
		{
			url: '/order-online',
			title: 'Indian Food Delivery Vancouver | Order Online | Sula',
			h1: 'Order Online',
			summary: 'Direct online ordering. $5 flat delivery, $35 minimum order, 8 km radius from each location.'
		},
		{
			url: '/drinks-menu',
			title: 'Drinks Menu | Cocktails, Wine and Beer | Sula Vancouver',
			h1: '',
			summary: 'Award-winning cocktail menu by Jeff Savage. Indian-botanical cocktails, BC wines, craft beer, spirit-free options.'
		},
		{
			url: '/indian-food-delivery-vancouver',
			title: 'Indian Food Delivery and Take Out Vancouver | Sula',
			h1: 'Indian Food Delivery Vancouver, Authentic Indian Takeout Since 2010',
			summary: 'Delivery hub with 6 FAQs. $5 flat fee, $35 min, 8 km radius.'
		},
		{
			url: '/products',
			title: 'Products, Sula Indian Restaurant',
			h1: 'Everyday Kitchen Essentials',
			summary: 'Artisan kulfi, curated wines by Gehringer Brothers, premium Indian-inspired flatware.'
		},
		{
			url: '/indian-restaurant-vancouver',
			title: 'Sula Indian Restaurant Vancouver | Authentic Indian Food',
			h1: 'Sula Indian Restaurant Vancouver with locations on Commercial Drive, Main Street and Davie Street',
			summary: 'High-level brand landing page for the three full-service restaurants.'
		},
		{
			url: '/vegan-restaurant-vancouver',
			title: 'Vegan Indian Restaurant Vancouver | Sula',
			h1: 'Explore Flavorful Vegan Indian Food options in Vancouver',
			summary: 'Authentic vegan Indian food across Vancouver locations. Plant-based curries, chaats, vegan naan.'
		},
		{
			url: '/list-of-awards',
			title: 'Awards and Recognition | Sula Indian Restaurant Vancouver',
			h1: 'Awards speak about us more than us',
			summary: '16+ awards including Best Indian Restaurant from Vancouver Magazine and Georgia Straight. Award-winning dining since 2010.'
		},
		{
			url: '/happy-hour-vancouver',
			title: 'Best Happy Hour Deals in Vancouver, Sula Indian Restaurant',
			h1: 'Because Every Hour Should Be Happy',
			summary: 'Happy hour deals on Indian bites and refreshing drinks.'
		},
		{
			url: '/sula-events',
			title: 'Brunch, Happy Hour, Daily Specials and Tasting Menus',
			h1: 'Discover Sula Events',
			summary: 'Discounted drinks, daily chef specials, seasonal tasting menus, themed nights.'
		},
		{
			url: '/indian-lunch-restaurant-vancouver',
			title: 'Indian Lunch Restaurant Vancouver | Sula',
			h1: 'Indian Lunch Restaurant in Vancouver: Satisfy Your Midday Cravings at Sula',
			summary: "Sula's Indian lunch menu with dine-in, takeout, delivery options. Vegan, gluten-friendly, street food favorites."
		}
	] as RestaurantPageFact[]
};

// Build the in-prompt knowledge block. Render the structured data as plain
// markdown so the LLM can pattern-match on Q/A pairs and structured headers.
const RESTAURANT_KNOWLEDGE_HEADER = `## SULA INDIAN RESTAURANT KNOWLEDGE (sulaindianrestaurant.com, ingested ${RESTAURANT_KNOWLEDGE.crawledAt})

CANONICAL BRAND BIO (lead with this when describing Sula in any general / "tell me about Sula" reply):
**Sula is an award winning Indian restaurant. Heritage flavors with modern techniques, premium elevated drinks. We offer takeout, home delivery, catering, and events across Vancouver. Follow us on Instagram for the latest updates: @sularestaurant**

HARD RULE: Sula Indian Restaurant data is now part of your knowledge. When customers ask about restaurant hours, menu, locations, awards, or anything covered in the FAQ below, answer from this knowledge accurately. NEVER make up numbers, hours, prices, or facts that aren't in this corpus. If a question goes beyond this corpus (specific reservation availability, today's specials, a dish not listed), say you don't have that exact detail and route them to the right contact (the location's phone, the catering team, or the relevant page on sulaindianrestaurant.com). For halal certification, see HARD RULE: HALAL MENTIONS in the persona block, mention only when the customer asks about halal / dietary requirements.

This corpus is restaurant-side knowledge. It complements the catering-side knowledge in earlier blocks. When a customer asks "what are your hours?", default to the restaurant they're closest to or ask which location. When they ask "do you cater weddings?", route into the catering walkthrough. Don't confuse the two products.

`;

function renderLocations(): string {
	return (
		'### LOCATIONS (canonical from per-location Restaurant JSON-LD schema)\n\n' +
		RESTAURANT_KNOWLEDGE.locations
			.map(
				(l) => `**${l.name}**
Address: ${l.address}
Phone: ${l.phone || 'see catering line 604-215-1130'}
Hours: ${l.hours}
Hours detail: ${l.hoursDetail}
Rating: ${l.rating.value || 'n/a'}/5 (${l.rating.reviewCount || '0'} reviews)
${l.menuUrl ? 'Menu: ' + l.menuUrl + '\n' : ''}Notes: ${l.notes}
`
			)
			.join('\n')
	);
}

function renderAwards(): string {
	return (
		'### AWARDS\n\n' +
		RESTAURANT_KNOWLEDGE.awards.map((a) => `- ${a.year}: ${a.award} (${a.location})${(a as any).notes ? '. ' + (a as any).notes : ''}`).join('\n') +
		'\n'
	);
}

function renderCuisine(): string {
	const c = RESTAURANT_KNOWLEDGE.cuisineHighlights;
	return `### CUISINE HIGHLIGHTS

Signature dishes: ${c.signatureDishes.join(', ')}
Mother gravies: ${c.mothergravies}
Vegan naan: ${c.veganNaan}
Halal: ${c.halal}
Spice level: ${c.spiceLevel}
Gluten-friendly: ${c.glutenFriendly}
`;
}

function renderCatering(): string {
	const c = RESTAURANT_KNOWLEDGE.cateringSummary;
	return `### CATERING SUMMARY (from /catering-vancouver, /party-catering, /corporate-catering)

Service area: ${c.serviceArea.join(', ')}
Minimum guests: ${c.minimumGuests}
Lead time: ${c.leadTime}
Party packages:
- 2 curries: ${c.partyPackages.twoCurry}
- Premium: ${c.partyPackages.premium}
- Vegetarian/Vegan: ${c.partyPackages.vegetarianVegan}
- Add-ons: ${c.partyPackages.addons}
- Dinnerware: ${c.partyPackages.dinnerware}
- Aluminium trays: ${c.partyPackages.aluminiumTrays}
- Group size: ${c.partyPackages.groupSize}
Featured catering dishes: ${c.featuredCateringDishes.join(', ')}
Event types: ${c.eventTypes.join(', ')}
Setup: ${c.setup}
Quote requests: ${c.quoteRequest}
`;
}

function renderDelivery(): string {
	const d = RESTAURANT_KNOWLEDGE.delivery;
	return `### DELIVERY AND TAKEOUT (from /indian-food-delivery-vancouver, /order-online)

Flat fee: ${d.flatFee}
Minimum order: ${d.minimumOrder}
Radius: ${d.radius}
Best for delivery: ${d.bestForDelivery}
Vegan delivery: ${d.veganDelivery}
`;
}

function renderHappyHourBrunch(): string {
	const h = RESTAURANT_KNOWLEDGE.happyHour;
	const b = RESTAURANT_KNOWLEDGE.brunch;
	const t = RESTAURANT_KNOWLEDGE.tastingMenu;
	return `### HAPPY HOUR / BRUNCH / TASTING MENU

Happy hour Commercial Drive: ${h.commercialDrive}
Happy hour general: ${h.general}
Brunch Commercial Drive: ${b.commercialDrive}
Brunch Davie Street: ${b.davieStreet}
Brunch style: ${b.menuStyle}
Tasting menu: ${t.name} at ${t.location}, ${t.price}, wine pairing ${t.winePairing}. ${t.rules}
`;
}

function renderFaqs(): string {
	const grouped: Record<string, RestaurantFaq[]> = {};
	for (const f of RESTAURANT_KNOWLEDGE.faqs) {
		(grouped[f.category] ||= []).push(f);
	}
	let out = '### FAQS (from FAQPage JSON-LD schema and /contact accordion)\n\n';
	for (const cat of Object.keys(grouped).sort()) {
		out += `**Category: ${cat}** (${grouped[cat].length})\n\n`;
		for (const f of grouped[cat]) {
			out += `Q (${f.page}): ${f.q}\nA: ${f.a}\n\n`;
		}
	}
	return out;
}

function renderPageIndex(): string {
	return (
		'### PAGE INDEX (titles, H1, summary)\n\n' +
		RESTAURANT_KNOWLEDGE.pageFacts.map((p) => `- ${p.url} | ${p.title} | H1: "${p.h1}" | ${p.summary}`).join('\n') +
		'\n'
	);
}

export const RESTAURANT_KNOWLEDGE_TEXT =
	RESTAURANT_KNOWLEDGE_HEADER +
	renderLocations() +
	'\n' +
	renderAwards() +
	'\n' +
	renderCuisine() +
	'\n' +
	renderCatering() +
	'\n' +
	renderDelivery() +
	'\n' +
	renderHappyHourBrunch() +
	'\n' +
	renderFaqs() +
	'\n' +
	renderPageIndex();
