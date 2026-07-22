"""
Symbol Registry for BIST 100, NASDAQ, and Crypto Markets.
Provides rich metadata including ticker symbol, full company name, sector, and search utility.
"""

from typing import List, Dict, Optional

# BIST 100 Stock Database
BIST_100_SYMBOLS: List[Dict[str, str]] = [
    {"symbol": "THYAO", "name": "Türk Hava Yolları A.O.", "sector": "Ulaştırma", "exchange": "BIST", "ticker": "THYAO.IS"},
    {"symbol": "GARAN", "name": "Türkiye Garanti Bankası A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "GARAN.IS"},
    {"symbol": "EREGL", "name": "Ereğli Demir ve Çelik Fabrikaları T.A.Ş.", "sector": "Metal Ana Sanayi", "exchange": "BIST", "ticker": "EREGL.IS"},
    {"symbol": "AKBNK", "name": "Akbank T.A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "AKBNK.IS"},
    {"symbol": "SISE", "name": "Türkiye Şişe ve Cam Fabrikaları A.Ş.", "sector": "Cam ve Cam Ürünleri", "exchange": "BIST", "ticker": "SISE.IS"},
    {"symbol": "ASELS", "name": "Aselsan Elektronik Sanayi ve Ticaret A.Ş.", "sector": "Savunma & Teknoloji", "exchange": "BIST", "ticker": "ASELS.IS"},
    {"symbol": "KCHOL", "name": "Koç Holding A.Ş.", "sector": "Holdingler", "exchange": "BIST", "ticker": "KCHOL.IS"},
    {"symbol": "TUPRS", "name": "Tüpraş - Türkiye Petrol Rafinerileri A.Ş.", "sector": "Kimya & Petrol", "exchange": "BIST", "ticker": "TUPRS.IS"},
    {"symbol": "BIMAS", "name": "BİM Birleşik Mağazalar A.Ş.", "sector": "Perakende Ticaret", "exchange": "BIST", "ticker": "BIMAS.IS"},
    {"symbol": "SAHOL", "name": "Hacı Ömer Sabancı Holding A.Ş.", "sector": "Holdingler", "exchange": "BIST", "ticker": "SAHOL.IS"},
    {"symbol": "ISCTR", "name": "Türkiye İş Bankası A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "ISCTR.IS"},
    {"symbol": "YKBNK", "name": "Yapı ve Kredi Bankası A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "YKBNK.IS"},
    {"symbol": "VAKBN", "name": "Türkiye Vakıflar Bankası T.A.O.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "VAKBN.IS"},
    {"symbol": "HALKB", "name": "Türkiye Halk Bankası A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "HALKB.IS"},
    {"symbol": "EKGYO", "name": "Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.", "sector": "Gayrimenkul", "exchange": "BIST", "ticker": "EKGYO.IS"},
    {"symbol": "KOZAL", "name": "Koza Altın İşletmeleri A.Ş.", "sector": "Madencilik", "exchange": "BIST", "ticker": "KOZAL.IS"},
    {"symbol": "KOZAA", "name": "Koza Anadolu Metal Madencilik İşletmeleri A.Ş.", "sector": "Madencilik", "exchange": "BIST", "ticker": "KOZAA.IS"},
    {"symbol": "IPEKE", "name": "İpek Doğal Enerji Kaynakları Araştırma ve Üretim A.Ş.", "sector": "Enerji", "exchange": "BIST", "ticker": "IPEKE.IS"},
    {"symbol": "SASA", "name": "SASA Polyester Sanayi A.Ş.", "sector": "Tekstil & Kimya", "exchange": "BIST", "ticker": "SASA.IS"},
    {"symbol": "HEKTS", "name": "Hektaş Ticaret T.A.Ş.", "sector": "Kimya & Tarım", "exchange": "BIST", "ticker": "HEKTS.IS"},
    {"symbol": "PETKM", "name": "Petkim Petrokimya Holding A.Ş.", "sector": "Kimya & Petrokimya", "exchange": "BIST", "ticker": "PETKM.IS"},
    {"symbol": "TAVHL", "name": "TAV Havalimanları Holding A.Ş.", "sector": "Ulaştırma & Havacılık", "exchange": "BIST", "ticker": "TAVHL.IS"},
    {"symbol": "PGSUS", "name": "Pegasus Hava Taşımacılığı A.Ş.", "sector": "Ulaştırma & Havacılık", "exchange": "BIST", "ticker": "PGSUS.IS"},
    {"symbol": "ALARK", "name": "Alarko Holding A.Ş.", "sector": "Holdingler & Enerji", "exchange": "BIST", "ticker": "ALARK.IS"},
    {"symbol": "ARCLK", "name": "Arçelik A.Ş.", "sector": "Dayanıklı Tüketim", "exchange": "BIST", "ticker": "ARCLK.IS"},
    {"symbol": "FROTO", "name": "Ford Otomotiv Sanayi A.Ş.", "sector": "Otomotiv", "exchange": "BIST", "ticker": "FROTO.IS"},
    {"symbol": "TOASO", "name": "Tofaş Türk Otomobil Fabrikası A.Ş.", "sector": "Otomotiv", "exchange": "BIST", "ticker": "TOASO.IS"},
    {"symbol": "MAVI", "name": "Mavi Giyim Sanayi ve Ticaret A.Ş.", "sector": "Tekstil & Perakende", "exchange": "BIST", "ticker": "MAVI.IS"},
    {"symbol": "CIMSA", "name": "Çimsa Çimento Sanayi ve Ticaret A.Ş.", "sector": "Çimento & İnşaat", "exchange": "BIST", "ticker": "CIMSA.IS"},
    {"symbol": "AKSA", "name": "Aksa Akrilik Kimya Sanayii A.Ş.", "sector": "Kimya & Elyaf", "exchange": "BIST", "ticker": "AKSA.IS"},
    {"symbol": "OTKAR", "name": "Otokar Otomotiv ve Savunma Sanayi A.Ş.", "sector": "Otomotiv & Savunma", "exchange": "BIST", "ticker": "OTKAR.IS"},
    {"symbol": "SOKM", "name": "Şok Marketler Ticaret A.Ş.", "sector": "Perakende Ticaret", "exchange": "BIST", "ticker": "SOKM.IS"},
    {"symbol": "TKFEN", "name": "Tekfen Holding A.Ş.", "sector": "Inşaat & Holding", "exchange": "BIST", "ticker": "TKFEN.IS"},
    {"symbol": "ENKAI", "name": "Enka İnşaat ve Sanayi A.Ş.", "sector": "Inşaat & Enerji", "exchange": "BIST", "ticker": "ENKAI.IS"},
    {"symbol": "DOHOL", "name": "Doğan Şirketler Grubu Holding A.Ş.", "sector": "Holdingler", "exchange": "BIST", "ticker": "DOHOL.IS"},
    {"symbol": "OYAKC", "name": "Oyak Çimento Fabrikaları A.Ş.", "sector": "Çimento", "exchange": "BIST", "ticker": "OYAKC.IS"},
    {"symbol": "VESTL", "name": "Vestel Elektronik Sanayi ve Ticaret A.Ş.", "sector": "Elektronik", "exchange": "BIST", "ticker": "VESTL.IS"},
    {"symbol": "VESBE", "name": "Vestel Beyaz Eşya Sanayi ve Ticaret A.Ş.", "sector": "Dayanıklı Tüketim", "exchange": "BIST", "ticker": "VESBE.IS"},
    {"symbol": "ODAS", "name": "Odaş Elektrik Üretim Sanayi ve Ticaret A.Ş.", "sector": "Enerji & Madencilik", "exchange": "BIST", "ticker": "ODAS.IS"},
    {"symbol": "TURSG", "name": "Türkiye Sigorta A.Ş.", "sector": "Sigortacılık", "exchange": "BIST", "ticker": "TURSG.IS"},
    {"symbol": "ASTOR", "name": "Astor Enerji A.Ş.", "sector": "Elektrik & Enerji", "exchange": "BIST", "ticker": "ASTOR.IS"},
    {"symbol": "KONTR", "name": "Kontrolmatik Teknoloji Enerji ve Mühendislik A.Ş.", "sector": "Teknoloji & Enerji", "exchange": "BIST", "ticker": "KONTR.IS"},
    {"symbol": "GESAN", "name": "Girişim Elektrik Sanayi Taahhüt ve Ticaret A.Ş.", "sector": "Enerji & Mühendislik", "exchange": "BIST", "ticker": "GESAN.IS"},
    {"symbol": "ALFAS", "name": "Alfa Solar Enerji Sanayi ve Ticaret A.Ş.", "sector": "Yenilenebilir Enerji", "exchange": "BIST", "ticker": "ALFAS.IS"},
    {"symbol": "SMRTG", "name": "Smart Güneş Enerjisi Teknolojileri A.Ş.", "sector": "Yenilenebilir Enerji", "exchange": "BIST", "ticker": "SMRTG.IS"},
    {"symbol": "EUPWR", "name": "Europower Enerji ve Otomasyon Teknolojileri A.Ş.", "sector": "Enerji & Otomasyon", "exchange": "BIST", "ticker": "EUPWR.IS"},
    {"symbol": "KCAER", "name": "Kocaer Çelik Sanayi ve Ticaret A.Ş.", "sector": "Demir Çelik", "exchange": "BIST", "ticker": "KCAER.IS"},
    {"symbol": "REEDR", "name": "Reeder Teknoloji Sanayi ve Ticaret A.Ş.", "sector": "Teknoloji & Elektronik", "exchange": "BIST", "ticker": "REEDR.IS"},
    {"symbol": "AGROT", "name": "Agrotech Yüksek Teknoloji ve Yatırım A.Ş.", "sector": "Yazılım & Teknoloji", "exchange": "BIST", "ticker": "AGROT.IS"},
    {"symbol": "TABGD", "name": "TAB Gıda Sanayi ve Ticaret A.Ş.", "sector": "Gıda & Restoran", "exchange": "BIST", "ticker": "TABGD.IS"},
    {"symbol": "DOAS", "name": "Doğuş Otomotiv Servis ve Ticaret A.Ş.", "sector": "Otomotiv Servis", "exchange": "BIST", "ticker": "DOAS.IS"},
    {"symbol": "MIATK", "name": "Mia Teknoloji A.Ş.", "sector": "Yazılım & Bilişim", "exchange": "BIST", "ticker": "MIATK.IS"},
    {"symbol": "CANTE", "name": "Çan2 Termik A.Ş.", "sector": "Enerji", "exchange": "BIST", "ticker": "CANTE.IS"},
    {"symbol": "BRSAN", "name": "Borusan Mannesmann Boru Sanayi ve Ticaret A.Ş.", "sector": "Metal Boru Sanayi", "exchange": "BIST", "ticker": "BRSAN.IS"},
    {"symbol": "BERA", "name": "Bera Holding A.Ş.", "sector": "Holdingler", "exchange": "BIST", "ticker": "BERA.IS"},
    {"symbol": "ECILC", "name": "Eczacıbaşı İlaç Sınai ve Finansal Yatırımlar A.Ş.", "sector": "İlaç & Sağlık", "exchange": "BIST", "ticker": "ECILC.IS"},
    {"symbol": "EGEEN", "name": "Ege Endüstri ve Ticaret A.Ş.", "sector": "Otomotiv Yan Sanayi", "exchange": "BIST", "ticker": "EGEEN.IS"},
    {"symbol": "GENIL", "name": "Gen İlaç ve Sağlık Ürünleri Sanayi ve Ticaret A.Ş.", "sector": "İlaç", "exchange": "BIST", "ticker": "GENIL.IS"},
    {"symbol": "GUBRF", "name": "Gübre Fabrikaları T.A.Ş.", "sector": "Kimya & Gübre", "exchange": "BIST", "ticker": "GUBRF.IS"},
    {"symbol": "ISGYO", "name": "İş Gayrimenkul Yatırım Ortaklığı A.Ş.", "sector": "Gayrimenkul", "exchange": "BIST", "ticker": "ISGYO.IS"},
    {"symbol": "ISMEN", "name": "İş Yatırım Menkul Değerler A.Ş.", "sector": "Aracı Kurum", "exchange": "BIST", "ticker": "ISMEN.IS"},
    {"symbol": "KORDS", "name": "Kordsa Teknik Tekstil A.Ş.", "sector": "Tekstil & Endüstri", "exchange": "BIST", "ticker": "KORDS.IS"},
    {"symbol": "MPARK", "name": "MLP Sağlık Hizmetleri A.Ş. (Medical Park)", "sector": "Sağlık Hizmetleri", "exchange": "BIST", "ticker": "MPARK.IS"},
    {"symbol": "QUAGR", "name": "Qua Granite Hayal Yapı ve Ürünleri Sanayi A.Ş.", "sector": "Seramik & Yapı", "exchange": "BIST", "ticker": "QUAGR.IS"},
    {"symbol": "SDTTR", "name": "SDT Uzay ve Savunma Teknolojileri A.Ş.", "sector": "Savunma & Uzay", "exchange": "BIST", "ticker": "SDTTR.IS"},
    {"symbol": "SKBNK", "name": "Şekerbank T.A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "SKBNK.IS"},
    {"symbol": "TSKB", "name": "Türkiye Sınai Kalkınma Bankası A.Ş.", "sector": "Bankacılık", "exchange": "BIST", "ticker": "TSKB.IS"},
    {"symbol": "TTKOM", "name": "Türk Telekomünikasyon A.Ş.", "sector": "Telekomünikasyon", "exchange": "BIST", "ticker": "TTKOM.IS"},
    {"symbol": "TCELL", "name": "Turkcell İletişim Hizmetleri A.Ş.", "sector": "Telekomünikasyon", "exchange": "BIST", "ticker": "TCELL.IS"},
    {"symbol": "ULKER", "name": "Ülker Bisküvi Sanayi A.Ş.", "sector": "Gıda İmalatı", "exchange": "BIST", "ticker": "ULKER.IS"},
    {"symbol": "ZOREN", "name": "Zorlu Enerji Elektrik Üretim A.Ş.", "sector": "Enerji", "exchange": "BIST", "ticker": "ZOREN.IS"},
    {"symbol": "AKFGY", "name": "Akfen Gayrimenkul Yatırım Ortaklığı A.Ş.", "sector": "Gayrimenkul", "exchange": "BIST", "ticker": "AKFGY.IS"},
    {"symbol": "ALBRK", "name": "Albaraka Türk Katılım Bankası A.Ş.", "sector": "Katılım Bankacılığı", "exchange": "BIST", "ticker": "ALBRK.IS"},
    {"symbol": "AYDEM", "name": "Aydem Yenilenebilir Enerji A.Ş.", "sector": "Yenilenebilir Enerji", "exchange": "BIST", "ticker": "AYDEM.IS"},
    {"symbol": "BIOEN", "name": "Biotrend Çevre ve Enerji Yatırımları A.Ş.", "sector": "Yenilenebilir Enerji", "exchange": "BIST", "ticker": "BIOEN.IS"},
    {"symbol": "BUCIM", "name": "Bursa Çimento Fabrikası A.Ş.", "sector": "Çimento", "exchange": "BIST", "ticker": "BUCIM.IS"},
    {"symbol": "CWENE", "name": "CW Enerji Mühendislik Ticaret ve Sanayi A.Ş.", "sector": "Güneş Enerjisi", "exchange": "BIST", "ticker": "CWENE.IS"},
    {"symbol": "DEVA", "name": "Deva Holding A.Ş.", "sector": "İlaç", "exchange": "BIST", "ticker": "DEVA.IS"},
    {"symbol": "DOCO", "name": "DO & CO Aktiengesellschaft", "sector": "Gıda & İkram", "exchange": "BIST", "ticker": "DOCO.IS"},
    {"symbol": "ECZYT", "name": "Eczacıbaşı Yatırım Holding Ortaklığı A.Ş.", "sector": "Holding", "exchange": "BIST", "ticker": "ECZYT.IS"},
    {"symbol": "EUPWR", "name": "Europower Enerji A.Ş.", "sector": "Enerji", "exchange": "BIST", "ticker": "EUPWR.IS"},
    {"symbol": "GWIND", "name": "Galata Wind Enerji A.Ş.", "sector": "Rüzgar Enerjisi", "exchange": "BIST", "ticker": "GWIND.IS"},
    {"symbol": "INVEO", "name": "Inveo Yatırım Holding A.Ş.", "sector": "Yatırım", "exchange": "BIST", "ticker": "INVEO.IS"},
    {"symbol": "KLSYN", "name": "Kolesiyon Mobilya Sanayi A.Ş.", "sector": "Mobilya", "exchange": "BIST", "ticker": "KLSYN.IS"},
    {"symbol": "KONYA", "name": "Konya Çimento Sanayii A.Ş.", "sector": "Çimento", "exchange": "BIST", "ticker": "KONYA.IS"},
    {"symbol": "KMPUR", "name": "Kimteks Poliüretan Sanayi ve Ticaret A.Ş.", "sector": "Kimya", "exchange": "BIST", "ticker": "KMPUR.IS"},
    {"symbol": "MTRKS", "name": "Matriks Bilgi Dağıtım Hizmetleri A.Ş.", "sector": "Yazılım & Bilişim", "exchange": "BIST", "ticker": "MTRKS.IS"},
    {"symbol": "NTHOL", "name": "Net Holding A.Ş.", "sector": "Turizm & Otelcilik", "exchange": "BIST", "ticker": "NTHOL.IS"},
    {"symbol": "PASEU", "name": "Pasifik Eurasia Lojistik A.Ş.", "sector": "Lojistik", "exchange": "BIST", "ticker": "PASEU.IS"},
    {"symbol": "PENTA", "name": "Penta Teknoloji Ürünleri Dağıtım A.Ş.", "sector": "Teknoloji Dağıtım", "exchange": "BIST", "ticker": "PENTA.IS"},
    {"symbol": "SAYAS", "name": "Say Yenilenebilir Enerji Ekipmanları Sanayi A.Ş.", "sector": "Enerji Ekipmanları", "exchange": "BIST", "ticker": "SAYAS.IS"},
    {"symbol": "SELEC", "name": "Selçuk Ecza Deposu Ticaret ve Sanayi A.Ş.", "sector": "İlaç Dağıtım", "exchange": "BIST", "ticker": "SELEC.IS"},
    {"symbol": "SUWEN", "name": "Suwen Tekstil Sanayi ve Ticaret A.Ş.", "sector": "Tekstil & Perakende", "exchange": "BIST", "ticker": "SUWEN.IS"},
    {"symbol": "TATEN", "name": "Tatlıpınar Enerji Üretim A.Ş.", "sector": "Yenilenebilir Enerji", "exchange": "BIST", "ticker": "TATEN.IS"},
    {"symbol": "TMSN", "name": "Tümosan Motor ve Traktör Sanayi A.Ş.", "sector": "Motor & Traktör", "exchange": "BIST", "ticker": "TMSN.IS"},
    {"symbol": "TRGYO", "name": "Torunlar Gayrimenkul Yatırım Ortaklığı A.Ş.", "sector": "Gayrimenkul", "exchange": "BIST", "ticker": "TRGYO.IS"},
    {"symbol": "YEOTK", "name": "YEO Teknoloji Enerji ve Endüstri A.Ş.", "sector": "Enerji & Yazılım", "exchange": "BIST", "ticker": "YEOTK.IS"},
    {"symbol": "YYLGD", "name": "Yayla Agro Gıda Sanayi ve Ticaret A.Ş.", "sector": "Gıda", "exchange": "BIST", "ticker": "YYLGD.IS"},
]

# NASDAQ Stock Database (NASDAQ 100 & Major US Stocks)
NASDAQ_SYMBOLS: List[Dict[str, str]] = [
    {"symbol": "AAPL", "name": "Apple Inc.", "sector": "Consumer Electronics", "exchange": "NASDAQ", "ticker": "AAPL"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "sector": "Software & Cloud", "exchange": "NASDAQ", "ticker": "MSFT"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "sector": "Semiconductors & AI", "exchange": "NASDAQ", "ticker": "NVDA"},
    {"symbol": "AMZN", "name": "Amazon.com Inc.", "sector": "E-Commerce & Cloud", "exchange": "NASDAQ", "ticker": "AMZN"},
    {"symbol": "GOOGL", "name": "Alphabet Inc. (Class A)", "sector": "Internet & Search", "exchange": "NASDAQ", "ticker": "GOOGL"},
    {"symbol": "META", "name": "Meta Platforms Inc.", "sector": "Social Media & Tech", "exchange": "NASDAQ", "ticker": "META"},
    {"symbol": "TSLA", "name": "Tesla Inc.", "sector": "Automotive & Clean Energy", "exchange": "NASDAQ", "ticker": "TSLA"},
    {"symbol": "AVGO", "name": "Broadcom Inc.", "sector": "Semiconductors", "exchange": "NASDAQ", "ticker": "AVGO"},
    {"symbol": "COST", "name": "Costco Wholesale Corp.", "sector": "Retail & Wholesale", "exchange": "NASDAQ", "ticker": "COST"},
    {"symbol": "NFLX", "name": "Netflix Inc.", "sector": "Entertainment & Streaming", "exchange": "NASDAQ", "ticker": "NFLX"},
    {"symbol": "AMD", "name": "Advanced Micro Devices Inc.", "sector": "Semiconductors", "exchange": "NASDAQ", "ticker": "AMD"},
    {"symbol": "PEP", "name": "PepsiCo Inc.", "sector": "Consumer Goods & Beverages", "exchange": "NASDAQ", "ticker": "PEP"},
    {"symbol": "TMUS", "name": "T-Mobile US Inc.", "sector": "Telecommunications", "exchange": "NASDAQ", "ticker": "TMUS"},
    {"symbol": "ADBE", "name": "Adobe Inc.", "sector": "Software & Design", "exchange": "NASDAQ", "ticker": "ADBE"},
    {"symbol": "CSCO", "name": "Cisco Systems Inc.", "sector": "Networking & Security", "exchange": "NASDAQ", "ticker": "CSCO"},
    {"symbol": "INTC", "name": "Intel Corporation", "sector": "Semiconductors", "exchange": "NASDAQ", "ticker": "INTC"},
    {"symbol": "CMCSA", "name": "Comcast Corporation", "sector": "Media & Telecom", "exchange": "NASDAQ", "ticker": "CMCSA"},
    {"symbol": "QCOM", "name": "Qualcomm Inc.", "sector": "Semiconductors & Mobile", "exchange": "NASDAQ", "ticker": "QCOM"},
    {"symbol": "TXN", "name": "Texas Instruments Inc.", "sector": "Semiconductors", "exchange": "NASDAQ", "ticker": "TXN"},
    {"symbol": "AMGN", "name": "Amgen Inc.", "sector": "Biotechnology", "exchange": "NASDAQ", "ticker": "AMGN"},
    {"symbol": "HON", "name": "Honeywell International Inc.", "sector": "Industrial & Aerospace", "exchange": "NASDAQ", "ticker": "HON"},
    {"symbol": "AMAT", "name": "Applied Materials Inc.", "sector": "Semiconductor Equipment", "exchange": "NASDAQ", "ticker": "AMAT"},
    {"symbol": "BKNG", "name": "Booking Holdings Inc.", "sector": "Travel & E-Commerce", "exchange": "NASDAQ", "ticker": "BKNG"},
    {"symbol": "SBUX", "name": "Starbucks Corp.", "sector": "Restaurants & Coffee", "exchange": "NASDAQ", "ticker": "SBUX"},
    {"symbol": "MDLZ", "name": "Mondelez International Inc.", "sector": "Food & Confectionery", "exchange": "NASDAQ", "ticker": "MDLZ"},
    {"symbol": "VRTX", "name": "Vertex Pharmaceuticals Inc.", "sector": "Biotechnology", "exchange": "NASDAQ", "ticker": "VRTX"},
    {"symbol": "ADP", "name": "Automatic Data Processing Inc.", "sector": "Human Capital Software", "exchange": "NASDAQ", "ticker": "ADP"},
    {"symbol": "LRCX", "name": "Lam Research Corp.", "sector": "Semiconductor Equipment", "exchange": "NASDAQ", "ticker": "LRCX"},
    {"symbol": "PANW", "name": "Palo Alto Networks Inc.", "sector": "Cybersecurity", "exchange": "NASDAQ", "ticker": "PANW"},
    {"symbol": "REGN", "name": "Regeneron Pharmaceuticals Inc.", "sector": "Biotechnology", "exchange": "NASDAQ", "ticker": "REGN"},
    {"symbol": "MU", "name": "Micron Technology Inc.", "sector": "Memory & Semiconductors", "exchange": "NASDAQ", "ticker": "MU"},
    {"symbol": "SNPS", "name": "Synopsys Inc.", "sector": "Software & Chip Design", "exchange": "NASDAQ", "ticker": "SNPS"},
    {"symbol": "KLAC", "name": "KLA Corporation", "sector": "Semiconductor Equipment", "exchange": "NASDAQ", "ticker": "KLAC"},
    {"symbol": "CDNS", "name": "Cadence Design Systems Inc.", "sector": "Software & Chip Design", "exchange": "NASDAQ", "ticker": "CDNS"},
    {"symbol": "PYPL", "name": "PayPal Holdings Inc.", "sector": "Fintech & Payments", "exchange": "NASDAQ", "ticker": "PYPL"},
    {"symbol": "ASML", "name": "ASML Holding N.V.", "sector": "Semiconductor Photolithography", "exchange": "NASDAQ", "ticker": "ASML"},
    {"symbol": "MAR", "name": "Marriott International Inc.", "sector": "Hotels & Hospitality", "exchange": "NASDAQ", "ticker": "MAR"},
    {"symbol": "ORLY", "name": "O'Reilly Automotive Inc.", "sector": "Auto Parts Retail", "exchange": "NASDAQ", "ticker": "ORLY"},
    {"symbol": "CRWD", "name": "CrowdStrike Holdings Inc.", "sector": "Cybersecurity", "exchange": "NASDAQ", "ticker": "CRWD"},
    {"symbol": "NXPI", "name": "NXP Semiconductors N.V.", "sector": "Automotive Semiconductors", "exchange": "NASDAQ", "ticker": "NXPI"},
    {"symbol": "ROST", "name": "Ross Stores Inc.", "sector": "Retail", "exchange": "NASDAQ", "ticker": "ROST"},
    {"symbol": "MELI", "name": "MercadoLibre Inc.", "sector": "E-Commerce & Fintech", "exchange": "NASDAQ", "ticker": "MELI"},
    {"symbol": "ADSK", "name": "Autodesk Inc.", "sector": "3D Software & Engineering", "exchange": "NASDAQ", "ticker": "ADSK"},
    {"symbol": "CTAS", "name": "Cintas Corp.", "sector": "Commercial Services", "exchange": "NASDAQ", "ticker": "CTAS"},
    {"symbol": "FTNT", "name": "Fortinet Inc.", "sector": "Cybersecurity", "exchange": "NASDAQ", "ticker": "FTNT"},
    {"symbol": "PCAR", "name": "PACCAR Inc.", "sector": "Heavy Trucks & Machinery", "exchange": "NASDAQ", "ticker": "PCAR"},
    {"symbol": "MCHP", "name": "Microchip Technology Inc.", "sector": "Semiconductors", "exchange": "NASDAQ", "ticker": "MCHP"},
    {"symbol": "KDP", "name": "Keurig Dr Pepper Inc.", "sector": "Beverages", "exchange": "NASDAQ", "ticker": "KDP"},
    {"symbol": "PAYX", "name": "Paychex Inc.", "sector": "HR & Payroll Software", "exchange": "NASDAQ", "ticker": "PAYX"},
    {"symbol": "IDXX", "name": "IDEXX Laboratories Inc.", "sector": "Veterinary Diagnostics", "exchange": "NASDAQ", "ticker": "IDXX"},
    {"symbol": "AEP", "name": "American Electric Power Co.", "sector": "Utilities", "exchange": "NASDAQ", "ticker": "AEP"},
    {"symbol": "FAST", "name": "Fastenal Co.", "sector": "Industrial Fasteners", "exchange": "NASDAQ", "ticker": "FAST"},
    {"symbol": "ODFL", "name": "Old Dominion Freight Line Inc.", "sector": "Trucking & Logistics", "exchange": "NASDAQ", "ticker": "ODFL"},
    {"symbol": "CPRT", "name": "Copart Inc.", "sector": "Vehicle Auctions", "exchange": "NASDAQ", "ticker": "CPRT"},
    {"symbol": "CPNG", "name": "Coupang Inc.", "sector": "E-Commerce", "exchange": "NASDAQ", "ticker": "CPNG"},
    {"symbol": "MNST", "name": "Monster Beverage Corp.", "sector": "Energy Drinks", "exchange": "NASDAQ", "ticker": "MNST"},
    {"symbol": "DXCM", "name": "DexCom Inc.", "sector": "Medical Devices", "exchange": "NASDAQ", "ticker": "DXCM"},
    {"symbol": "EXC", "name": "Exelon Corp.", "sector": "Electric Utilities", "exchange": "NASDAQ", "ticker": "EXC"},
    {"symbol": "ROKU", "name": "Roku Inc.", "sector": "Streaming Hardware & Ads", "exchange": "NASDAQ", "ticker": "ROKU"},
    {"symbol": "SQ", "name": "Block Inc. (Square)", "sector": "Fintech & Payments", "exchange": "NASDAQ", "ticker": "SQ"},
    {"symbol": "COIN", "name": "Coinbase Global Inc.", "sector": "Crypto Exchange", "exchange": "NASDAQ", "ticker": "COIN"},
    {"symbol": "PLTR", "name": "Palantir Technologies Inc.", "sector": "Data Analytics & AI", "exchange": "NASDAQ", "ticker": "PLTR"},
    {"symbol": "ARM", "name": "Arm Holdings plc", "sector": "CPU Architecture & AI", "exchange": "NASDAQ", "ticker": "ARM"},
    {"symbol": "SMCI", "name": "Super Micro Computer Inc.", "sector": "AI Server Hardware", "exchange": "NASDAQ", "ticker": "SMCI"},
    {"symbol": "DIS", "name": "The Walt Disney Company", "sector": "Entertainment", "exchange": "NYSE", "ticker": "DIS"},
    {"symbol": "BA", "name": "The Boeing Company", "sector": "Aerospace & Defense", "exchange": "NYSE", "ticker": "BA"},
    {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "sector": "Investment Banking", "exchange": "NYSE", "ticker": "JPM"},
    {"symbol": "V", "name": "Visa Inc.", "sector": "Payment Network", "exchange": "NYSE", "ticker": "V"},
    {"symbol": "MA", "name": "Mastercard Inc.", "sector": "Payment Network", "exchange": "NYSE", "ticker": "MA"},
    {"symbol": "WMT", "name": "Walmart Inc.", "sector": "Retail Superstores", "exchange": "NYSE", "ticker": "WMT"},
    {"symbol": "UNH", "name": "UnitedHealth Group Inc.", "sector": "Healthcare Insurance", "exchange": "NYSE", "ticker": "UNH"},
    {"symbol": "HD", "name": "The Home Depot Inc.", "sector": "Home Improvement Retail", "exchange": "NYSE", "ticker": "HD"},
    {"symbol": "PG", "name": "The Procter & Gamble Co.", "sector": "Consumer Goods", "exchange": "NYSE", "ticker": "PG"},
    {"symbol": "CVX", "name": "Chevron Corp.", "sector": "Energy & Oil", "exchange": "NYSE", "ticker": "CVX"},
    {"symbol": "XOM", "name": "Exxon Mobil Corp.", "sector": "Energy & Oil", "exchange": "NYSE", "ticker": "XOM"},
    {"symbol": "NKE", "name": "NIKE Inc.", "sector": "Footwear & Apparel", "exchange": "NYSE", "ticker": "NKE"},
    {"symbol": "JNJ", "name": "Johnson & Johnson", "sector": "Pharmaceuticals", "exchange": "NYSE", "ticker": "JNJ"},
    {"symbol": "BAC", "name": "Bank of America Corp.", "sector": "Banking", "exchange": "NYSE", "ticker": "BAC"},
    {"symbol": "PFE", "name": "Pfizer Inc.", "sector": "Pharmaceuticals", "exchange": "NYSE", "ticker": "PFE"},
    {"symbol": "ABBV", "name": "AbbVie Inc.", "sector": "Biotechnology", "exchange": "NYSE", "ticker": "ABBV"},
    {"symbol": "KO", "name": "The Coca-Cola Company", "sector": "Beverages", "exchange": "NYSE", "ticker": "KO"},
    {"symbol": "LLY", "name": "Eli Lilly and Company", "sector": "Pharmaceuticals", "exchange": "NYSE", "ticker": "LLY"},
    {"symbol": "MRK", "name": "Merck & Co. Inc.", "sector": "Pharmaceuticals", "exchange": "NYSE", "ticker": "MRK"},
    {"symbol": "PDD", "name": "PDD Holdings Inc. (Temu)", "sector": "E-Commerce", "exchange": "NASDAQ", "ticker": "PDD"},
]

# Binance Crypto Database
BINANCE_SYMBOLS: List[Dict[str, str]] = [
    {"symbol": "BTCUSDT", "name": "Bitcoin / Tether", "sector": "Layer 1 Crypto", "exchange": "BINANCE", "ticker": "BTCUSDT"},
    {"symbol": "ETHUSDT", "name": "Ethereum / Tether", "sector": "Layer 1 Smart Contracts", "exchange": "BINANCE", "ticker": "ETHUSDT"},
    {"symbol": "SOLUSDT", "name": "Solana / Tether", "sector": "Layer 1 High Speed", "exchange": "BINANCE", "ticker": "SOLUSDT"},
    {"symbol": "AVAXUSDT", "name": "Avalanche / Tether", "sector": "Layer 1 Smart Contracts", "exchange": "BINANCE", "ticker": "AVAXUSDT"},
    {"symbol": "BNBUSDT", "name": "BNB / Tether", "sector": "Exchange Token", "exchange": "BINANCE", "ticker": "BNBUSDT"},
    {"symbol": "XRPUSDT", "name": "XRP / Tether", "sector": "Payments", "exchange": "BINANCE", "ticker": "XRPUSDT"},
    {"symbol": "ADAUSDT", "name": "Cardano / Tether", "sector": "Layer 1", "exchange": "BINANCE", "ticker": "ADAUSDT"},
    {"symbol": "DOGEUSDT", "name": "Dogecoin / Tether", "sector": "Meme Coin", "exchange": "BINANCE", "ticker": "DOGEUSDT"},
    {"symbol": "DOTUSDT", "name": "Polkadot / Tether", "sector": "Interoperability", "exchange": "BINANCE", "ticker": "DOTUSDT"},
    {"symbol": "LINKUSDT", "name": "Chainlink / Tether", "sector": "Oracle & Infrastructure", "exchange": "BINANCE", "ticker": "LINKUSDT"},
    {"symbol": "MATICUSDT", "name": "Polygon / Tether", "sector": "Layer 2 Scaling", "exchange": "BINANCE", "ticker": "MATICUSDT"},
    {"symbol": "NEARUSDT", "name": "NEAR Protocol / Tether", "sector": "Layer 1 AI", "exchange": "BINANCE", "ticker": "NEARUSDT"},
    {"symbol": "FETUSDT", "name": "Artificial Superintelligence Alliance", "sector": "AI Crypto", "exchange": "BINANCE", "ticker": "FETUSDT"},
    {"symbol": "RENDERUSDT", "name": "Render Token / Tether", "sector": "GPU & AI Compute", "exchange": "BINANCE", "ticker": "RENDERUSDT"},
    {"symbol": "PEPEUSDT", "name": "Pepe / Tether", "sector": "Meme Coin", "exchange": "BINANCE", "ticker": "PEPEUSDT"},
    {"symbol": "SHIBUSDT", "name": "Shiba Inu / Tether", "sector": "Meme Coin", "exchange": "BINANCE", "ticker": "SHIBUSDT"},
    {"symbol": "SUIUSDT", "name": "Sui Network / Tether", "sector": "Layer 1 Move", "exchange": "BINANCE", "ticker": "SUIUSDT"},
    {"symbol": "APTUSDT", "name": "Aptos / Tether", "sector": "Layer 1 Move", "exchange": "BINANCE", "ticker": "APTUSDT"},
    {"symbol": "ARBUSDT", "name": "Arbitrum / Tether", "sector": "Layer 2 Ethereum", "exchange": "BINANCE", "ticker": "ARBUSDT"},
    {"symbol": "OPUSDT", "name": "Optimism / Tether", "sector": "Layer 2 Ethereum", "exchange": "BINANCE", "ticker": "OPUSDT"},
]


def get_symbols(provider: Optional[str] = None) -> List[Dict[str, str]]:
    """Returns list of all registered symbols for given provider or all providers."""
    if not provider:
        return BIST_100_SYMBOLS + NASDAQ_SYMBOLS + BINANCE_SYMBOLS
    
    p = provider.lower()
    if p == "bist":
        return BIST_100_SYMBOLS
    elif p in ["nasdaq", "nyse"]:
        return NASDAQ_SYMBOLS
    elif p == "binance":
        return BINANCE_SYMBOLS
    return []


def search_symbols(query: str, provider: Optional[str] = None) -> List[Dict[str, str]]:
    """
    Search symbols by query matching symbol, name, or sector.
    """
    query_clean = query.strip().upper()
    pool = get_symbols(provider)
    
    if not query_clean:
        return pool

        
    results = []
    for item in pool:
        s_upper = item["symbol"].upper()
        n_upper = item["name"].upper()
        sec_upper = item.get("sector", "").upper()
        
        # Match priority: Exact symbol > Symbol starts with > Name contains > Sector contains
        if s_upper == query_clean:
            score = 100
        elif s_upper.startswith(query_clean):
            score = 80
        elif query_clean in s_upper:
            score = 60
        elif query_clean in n_upper:
            score = 40
        elif query_clean in sec_upper:
            score = 20
        else:
            score = 0
            
        if score > 0:
            results.append((score, item))
            
    # Sort by relevance score descending
    results.sort(key=lambda x: x[0], reverse=True)
    return [r[1] for r in results]
