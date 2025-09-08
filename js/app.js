
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
      }
    });

    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-LVXHSZW7HT');

    // ====== 地圖初始化 ======
    var map = L.map('map').setView([25.0403, 121.4358], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // ====== 公用函式 ======
    function getColor(feature) {
      if (feature.properties && feature.properties.color) return feature.properties.color;
      return '#90aaad';
    }

    // ====== 全域變數 ======
    let polygonsLayer;     // 面層（./data/map.geojson）
    let convenienceLayer;  // 點層（./data/convenience.geojson）
    let restaurantLayer;   // 點層（./data/restaurant.geojson）
    let layerControl;      // 圖層控制器
    let householdLayer;    // 點層（./data/household.geojson）
	const POI_MIN_ZOOM = 18;   // 低於這個 zoom 就隱藏（數值越大 → 要放得越近才會顯示）
    window._highlightedLayers = [];
    window._featureLayers = [];
    
    // === 低縮放自動隱藏便利商店 icon ===
    let convenienceOverlayEnabled = true;  // 使用者目前是否在圖層控制器「有勾便利商店」

    function setConvenienceIconsVisible(visible) {
      if (!convenienceLayer) return;
      convenienceLayer.eachLayer(mk => {
        const el = mk.getElement && mk.getElement();
        if (el) el.style.display = visible ? '' : 'none';  // 隱藏 / 顯示 icon
      });
    }

    function updateConvenienceIconsVisibility() {
      if (!convenienceLayer) return;
      if (!convenienceOverlayEnabled) return;  // 使用者手動關掉時，不用管縮放
      const shouldShow = map.getZoom() >= POI_MIN_ZOOM;
      setConvenienceIconsVisible(shouldShow);
    }

	// === 低縮放自動隱藏「餐廳/飲食」 icon（和便利商店一樣的規則） ===
	let restaurantOverlayEnabled = true;

	function setRestaurantIconsVisible(visible) {
	  if (!restaurantLayer) return;
	  restaurantLayer.eachLayer(mk => {
	    const el = mk.getElement && mk.getElement();
	    if (el) el.style.display = visible ? '' : 'none';
	  });
	}

	function updateRestaurantIconsVisibility() {
	  if (!restaurantLayer) return;
	  if (!restaurantOverlayEnabled) return; // 使用者手動關閉時不干預
	  const shouldShow = map.getZoom() >= POI_MIN_ZOOM;
	  setRestaurantIconsVisible(shouldShow);
	}

	// === 低縮放自動隱藏「民生服務」 icon ===
	let householdOverlayEnabled = true;

	function setHouseholdIconsVisible(visible) {
	  if (!householdLayer) return;
	  householdLayer.eachLayer(mk => {
	    const el = mk.getElement && mk.getElement();
	    if (el) el.style.display = visible ? '' : 'none';
	  });
	}

	function updateHouseholdIconsVisibility() {
	  if (!householdLayer) return;
	  if (!householdOverlayEnabled) return; // 使用者手動關閉時不干預
	  const shouldShow = map.getZoom() >= POI_MIN_ZOOM;
	  setHouseholdIconsVisible(shouldShow);
	}

    // ====== 品牌圖示（PNG；不做縮放） ======
	function normalizeBrand(b) {
	  return (b || '')
	    .toString()
	    .trim()
	    .toLowerCase()
	    .replace(/\s+/g, '')     // 移除空白
	    .replace(/[._-]/g, '');  // 去掉常見分隔符（點/底線/連字符）
	}

    const BRAND_ALIASES = {
      '7eleven':   ['7-eleven','7_11','7eleven','統一超商','seven'],
      'familymart':['familymart','全家','全家便利商店'],
      'hilife':    ['hi-life','hilife','萊爾富'],
      'okmart':    ['ok','okmart','ok超商'],
      'layaburger':['laya','拉亞','拉亞漢堡'],
      'mwd':['mwd','麥味登','麥味登早餐'],
	  'watsons':     ['watsons','屈臣氏',"watson’s","watson's"],
	  'cosmed':      ['cosmed','康是美','cosmed康是美'],
	  'greattree':   ['greattree','大樹','大樹藥局','大樹連鎖藥局'],
	  'dingding':    ['丁丁','丁丁藥局']
    };
    
	const KNOWN_BRANDS = [
	  '7eleven','familymart','hilife','okmart',
	  'watsons','cosmed','greattree','dingding'
	];

	function brandKeyFrom(rawBrand) {
	  const norm = normalizeBrand(rawBrand);
	  if (KNOWN_BRANDS.includes(norm)) return norm;          // 直接命中
	  for (const k in BRAND_ALIASES) {                        // 別名比對
	    if (BRAND_ALIASES[k].some(a => normalizeBrand(a) === norm)) return k;
	  }
	  return null;
	}

    // 品牌 → 圖檔 URL
    const BRAND_ICON_URL = {
      '7eleven':   './img/brands/7eleven.png',
      'familymart':'./img/brands/familymart.png',
      'hilife':    './img/brands/hilife.png',
      'okmart':    './img/brands/okmart.png',
      'layaburger':'./img/brands/layaburger.png',
      'mwd':       './img/brands/mwd.png',
	  'watsons':   './img/brands/watsons.png',
	  'cosmed':    './img/brands/cosmed.png',
	  'greattree': './img/brands/greattree.png',
	  'dingding':  './img/brands/dingding.png'
    };
    // 使用 DivIcon 承載品牌圖片（不縮放）
    function makeBrandDivIcon(url) {
      return L.divIcon({
        html: `<img src="${url}" width="28" height="28" alt="">`,
        className: 'brand-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -24]
      });
    }
    // 便利商店找不到品牌時的預設
    const FALLBACK_ICON = L.divIcon({
      html: '<span style="font-size:22px;line-height:1">🏪</span>',
      className: 'brand-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -18]
    });
    
	// 餐廳/飲食沒有品牌時用的預設圖示
	const RESTAURANT_FALLBACK_URL = './img/brands/restaurant.png';


    // ====== 圖層控制器：等層載完再安裝（目前只放便利商店；要加入面層可取消註解） ======
	function tryAddLayerControl() {
	  if (layerControl) { layerControl.remove(); layerControl = null; }

	  const overlays = {};
	  // 想恢復面層切換就取消下一行註解
	  // if (polygonsLayer) overlays['土地分配'] = polygonsLayer;
	  if (convenienceLayer) overlays['便利商店'] = convenienceLayer;
	  if (restaurantLayer)  overlays['餐廳/飲食'] = restaurantLayer;
	  if (householdLayer)   overlays['民生服務'] = householdLayer;

	  if (Object.keys(overlays).length) {
	    layerControl = L.control.layers(null, overlays, { collapsed: false }).addTo(map);
	  }
	}


    // ====== 載入「面」GeoJSON（./data/map.geojson） ======
    fetch('./data/map.geojson', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        polygonsLayer = L.geoJSON(data, {
          style: function(feature) {
            let styleObj = {
              color: getColor(feature),
              weight: 1,
              fillOpacity: 0.6,
              fillColor: getColor(feature)
            };
            if (feature.properties && feature.properties.管理人 === "社宅預定地") {
              styleObj.fillColor = "#B39DDB"; styleObj.color = "#5E35B1";
            }
            if (feature.properties && feature.properties.用途 === "機捷泰山站") {
              styleObj.fillColor = "#868686"; styleObj.color = "#3c00ea"; styleObj.weight = 4;
            }
            if (feature.properties && feature.properties.用途 === "輔大捷運站4號出口") {
              styleObj.fillColor = "#868686"; styleObj.color = "#3c00ea"; styleObj.weight = 4;
            }
            if (feature.properties && feature.properties.用途 === "機捷貴和站") {
              styleObj.fillColor = "#868686"; styleObj.color = "#3c00ea"; styleObj.weight = 4;
            }
            return styleObj;
          },
          onEachFeature: function(feature, layer) {

            // 點擊：畫 300m/500m 同心圓與標籤＋清除鈕
            layer.on('click', function() {
              if (window._bufferCircle300) map.removeLayer(window._bufferCircle300);
              if (window._bufferCircle500) map.removeLayer(window._bufferCircle500);
              if (window._bufferCircleLabel300) map.removeLayer(window._bufferCircleLabel300);
              if (window._bufferCircleLabel500) map.removeLayer(window._bufferCircleLabel500);
              if (window._bufferCircleClearBtn) map.removeLayer(window._bufferCircleClearBtn);

              var latlngs = feature.geometry.coordinates[0].map(function(coord){ return [coord[1], coord[0]]; });
              var bounds = L.latLngBounds(latlngs);
              var center = bounds.getCenter();

              window._bufferCircle300 = L.circle(center, { color:'#43a047', fillColor:'#b9f6ca', fillOpacity:0.3, radius:300, interactive:false }).addTo(map);
              window._bufferCircle500 = L.circle(center, { color:'#ffb300', fillColor:'#ffe082', fillOpacity:0.2, radius:500, interactive:false }).addTo(map);

              function latOffset(center, meters){ return center.lat + (meters / 111320); }

              window._bufferCircleLabel300 = L.marker(
                [latOffset(center, 300), center.lng],
                { icon: L.divIcon({ className:'circle-label', html:'<div style="color:#388e3c;font-weight:bold;font-size:14px;background:rgba(255,255,255,0.85);border-radius:8px;padding:1px 8px;border:1px solid #43a047;display:inline-block;text-align:center;">300m</div>', iconSize:[48,22], iconAnchor:[24,11] }),
                  interactive:false
                }
              ).addTo(map);

              window._bufferCircleLabel500 = L.marker(
                [latOffset(center, 500), center.lng],
                { icon: L.divIcon({ className:'circle-label', html:'<div style="color:#ff6f00;font-weight:bold;font-size:14px;background:rgba(255,255,255,0.85);border-radius:8px;padding:1px 8px;border:1px solid #ffb300;display:inline-block;text-align:center;">500m</div>', iconSize:[48,22], iconAnchor:[24,11] }),
                  interactive:false
                }
              ).addTo(map);

              if (window._bufferCircleClearBtn) map.removeLayer(window._bufferCircleClearBtn);
              window._bufferCircleClearBtn = L.marker(
                [latOffset(center, 500) + 0.00025, center.lng + 0.0014],
                { icon: L.divIcon({ className:'circle-clear-btn', html:'<button title="只清除同心圓" onclick="window.removeCircles();" style="background:#fff;color:#ff6f00;font-weight:bold;border:1px solid #ffb300;border-radius:12px;padding:2px 12px;font-size:13px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.08);">清除</button>', iconSize:[52,28], iconAnchor:[26,14] }),
                  interactive:true
                }
              ).addTo(map);

              window.removeCircles = function() {
                if (window._bufferCircle300) map.removeLayer(window._bufferCircle300);
                if (window._bufferCircle500) map.removeLayer(window._bufferCircle500);
                if (window._bufferCircleLabel300) map.removeLayer(window._bufferCircleLabel300);
                if (window._bufferCircleLabel500) map.removeLayer(window._bufferCircleLabel500);
                if (window._bufferCircleClearBtn) map.removeLayer(window._bufferCircleClearBtn);
              };

              map.panTo([center.lat + 0.0015, center.lng]);
            });

            // popup
            var props = feature.properties;
            var info = '';
            for (var key in props) {
              if (key !== 'color' && key !== '圖片') info += key + ': ' + props[key] + '<br>';
            }
            if (props.圖片) info += '<img src="' + props.圖片 + '" style="max-width:150px; margin-top:5px;">';
            layer.bindPopup(info);
            layer.on('popupopen', function(e){
              var popup = e.popup;
              var images = popup.getElement().querySelectorAll('img');
              images.forEach(function(img){ img.addEventListener('load', function(){ popup.update(); }); });
            });

            // emoji 中央標記
            if (feature.geometry.type === 'Polygon') {
              var latlngs = feature.geometry.coordinates[0].map(function(coord){ return [coord[1], coord[0]]; });
              var bounds = L.latLngBounds(latlngs);
              var center = bounds.getCenter();
              var emoji = "";
              if (feature.properties.用途 === "社宅預定地") { emoji = "🏠";
              } else if (feature.properties.狀態 === "興建中") { emoji = "🏗️";
              } else if (feature.properties.管理人 === "教育局") { emoji = "🏫";
              } else if (feature.properties.用途 === "變電所用地") { emoji = "⚡";
              } else if (feature.properties.管理人 === "排除重劃") { emoji = "🚫";
              } else if (feature.properties.用途 === "行人便道") { emoji = "🚶‍♀"; }
              if (emoji) {
                var icon = L.divIcon({ html:'<div style="font-size:14px;">'+emoji+'</div>', className:'', iconSize:[24,24] });
                L.marker(center, { icon }).addTo(map);
              }
            }

            // 點擊高亮（1 秒）
            layer.on('click', function(){
              layer.setStyle({ weight:3, color:'#FFFF00', fillOpacity:0.7 });
              setTimeout(function(){
                layer.setStyle({ weight:1, color:getColor(feature), fillOpacity:0.5 });
              }, 1000);
            });
          }
        }).addTo(map);

        // 收集可高亮的 polygon 圖層（供搜尋）
        collectFeatureLayers();
        tryAddLayerControl();
      })
      .catch(error => console.error('map.geojson 載入失敗:', error));

    // ====== 載入「便利商店點位」GeoJSON（./data/convenience.geojson） ======
    fetch('./data/convenience.geojson', { cache: 'no-store' })
      .then(r => r.json())
      .then(pts => {
        convenienceLayer = L.geoJSON(pts, {
          pointToLayer: (feature, latlng) => {
            const p = feature.properties || {};
            const key = brandKeyFrom(p.品牌 ?? p.brand ?? '');
            const url = key ? BRAND_ICON_URL[key] : null;
            const icon = url ? makeBrandDivIcon(url) : FALLBACK_ICON;
            return L.marker(latlng, { icon });
          },
          onEachFeature: (feature, layer) => {
            const p = feature.properties || {};
            layer.bindPopup(
              `<b>${p.名稱 || p.name || '便利商店'}</b>` +
              (p.品牌 || p.brand ? `<br>品牌：${p.品牌 || p.brand}` : '') +
              (p.類型 || p.type || p.類別 ? `<br>類型：${p.類型 || p.type || p.類別}` : '') +
              (p.地址 || p.address ? `<br>地址：${p.地址 || p.address}` : '')
            );
          }
        }).addTo(map);
        convenienceOverlayEnabled = true;      // 初始視為有勾選
        updateConvenienceIconsVisibility();     // 依目前 zoom 先決定要不要顯示
        tryAddLayerControl();
      })
      .catch(err => console.error('convenience.geojson 載入失敗：', err));
      
	// ====== 載入「餐飲」點位 GeoJSON（./data/restaurant.geojson） ======
	fetch('./data/restaurant.geojson', { cache: 'no-store' })
	  .then(r => r.json())
	  .then(geo => {
	    restaurantLayer = L.geoJSON(geo, {
		pointToLayer: (feature, latlng) => {
		  const p = feature.properties || {};

		  // 盡量從「品牌」抓；沒有品牌就從「名稱」猜（常見：名稱含品牌）
		  const raw = (p.品牌 ?? p.brand ?? p.名稱 ?? p.name ?? '').toString();
		  const key = brandKeyFrom(raw);
		  const url = key ? BRAND_ICON_URL[key] : null;

		  // 如果有對到品牌，就用你的品牌 PNG；否則使用restaurant.png
		  const icon = url
		    ? makeBrandDivIcon(url)
		    : makeBrandDivIcon(RESTAURANT_FALLBACK_URL);

		  return L.marker(latlng, { icon });
		},

	      onEachFeature: (feature, layer) => {
	        const p = feature.properties || {};
	        layer.bindPopup(
	          `<b>${p.名稱 || p.name || '餐飲店家'}</b>` +
	          (p.類型 || p.type || p.類別 ? `<br>類型：${p.類型 || p.type || p.類別}` : '') +
	          (p.地址 || p.address       ? `<br>地址：${p.地址 || p.address}`       : '') +
	          (p.電話 || p.tel || p.phone? `<br>電話：${p.電話 || p.tel || p.phone}`: '')
	        );
	      }
	    }).addTo(map);
		restaurantOverlayEnabled = true;     // 初始視為「有勾選」
		updateRestaurantIconsVisibility();   // 依目前 zoom 先決定顯示/隱藏
	    tryAddLayerControl();				// 讓圖層控制器出現「餐飲（早餐/餐廳）」切換
	  })
	  .catch(err => console.error('restaurant.geojson 載入失敗：', err));

	//====== 載入「民生服務」點位 GeoJSON（./data/household.geojson） ======
	fetch('./data/household.geojson', { cache: 'no-store' })
	  .then(r => r.json())
	  .then(geo => {
	    householdLayer = L.geoJSON(geo, {
		pointToLayer: (feature, latlng) => {
		  const p = feature.properties || {};

		  // 先從「品牌/brand」抓；沒有就從「名稱/name」猜（多數店名會含品牌）
		  const raw = (p.品牌 ?? p.brand ?? p.名稱 ?? p.name ?? '').toString();
		  const key = brandKeyFrom(raw);
		  const url = key ? BRAND_ICON_URL[key] : null;

		  if (url) {
		    // 有對到品牌 → 用你的 PNG
		    return L.marker(latlng, { icon: makeBrandDivIcon(url) });
		  }

		  // 沒有品牌 → 用類型判斷 emoji（保留你原本的 fallback）
		  const t = (p.類型 || p.type || '').toString().toLowerCase();
		  let emoji = '🧰';
		  if (/藥|藥局|藥妝|pharm/.test(t))      emoji = '💊';
		  else if (/洗衣|laundry/.test(t))        emoji = '🧺';
		  else if (/五金|hardware|工具/.test(t))  emoji = '🛠️';
		  else if (/水果|水果行/.test(t))  		emoji = '🍇';
		  else if (/麵包|麵包店/.test(t))  		emoji = '🥐';
		  else if (/幼兒園|托嬰中心/.test(t))  		emoji = '🧑‍🏫';
		  else if (/甜點店|糕點店/.test(t))  		emoji = '🍩';

		  const icon = L.divIcon({
		    html: `<span style="font-size:20px;line-height:1.1">${emoji}</span>`,
		    className: 'household-icon',
		    iconSize: [20, 20],
		    iconAnchor: [10, 18],
		    popupAnchor: [0, -16]
		  });
		  return L.marker(latlng, { icon });
		},
	      onEachFeature: (feature, layer) => {
	        const p = feature.properties || {};
	        layer.bindPopup(
	          `<b>${p.名稱 || p.name || '民生服務'}</b>` +
	          (p.類型 || p.type ? `<br>類型：${p.類型 || p.type}` : '') +
	          (p.地址 || p.address ? `<br>地址：${p.地址 || p.address}` : '') +
	          (p.電話 || p.tel || p.phone ? `<br>電話：${p.電話 || p.tel || p.phone}` : '')
	        );
	      }
	    }).addTo(map);

	    householdOverlayEnabled = true; // 初始化：以目前 zoom 決定先顯示或隱藏
	    updateHouseholdIconsVisibility();
		tryAddLayerControl();  // 把「民生服務」加到圖層控制器
	  })
	  .catch(err => console.error('household.geojson 載入失敗：', err));

	// === 低縮放自動顯示/隱藏 icon（便利商店 + 餐廳/飲食 + 民生服務） ===
	// 縮放結束時，同步更新兩層
	map.on('zoomend', () => {
	  updateConvenienceIconsVisibility();
	  updateRestaurantIconsVisibility();
	  updateHouseholdIconsVisibility();
	});

	// 使用者在圖層控制器把某層「打開」：標記狀態 + 依當前 zoom 決定顯示
	map.on('overlayadd', (e) => {
	  if (e.layer === convenienceLayer) {
	    convenienceOverlayEnabled = true;  updateConvenienceIconsVisibility();
	  } else if (e.layer === restaurantLayer) {
	    restaurantOverlayEnabled = true;   updateRestaurantIconsVisibility();
	  } else if (e.layer === householdLayer) {
	    householdOverlayEnabled = true;    updateHouseholdIconsVisibility();
	  }
	});

	// 使用者在圖層控制器把某層「關閉」：標記狀態 + 立即隱藏
	map.on('overlayremove', (e) => {
	  if (e.layer === convenienceLayer) {
	    convenienceOverlayEnabled = false; setConvenienceIconsVisible(false);
	  } else if (e.layer === restaurantLayer) {
	    restaurantOverlayEnabled = false;  setRestaurantIconsVisible(false);
	  } else if (e.layer === householdLayer) {
	    householdOverlayEnabled = false;   setHouseholdIconsVisible(false);
	  }
	});


    // ==== 管理人高亮搜尋功能（只影響 polygon） ====
    function stripMask(str) { return (str || "").replace(/[○＊●_]/g, ""); }

    function collectFeatureLayers() {
      window._featureLayers = [];
      map.eachLayer(function(layer) {
        if (layer.feature &&
            layer.feature.properties &&
            layer.setStyle &&
            (layer.feature.geometry.type === 'Polygon' || layer.feature.geometry.type === 'MultiPolygon')) {
          window._featureLayers.push({ feature: layer.feature, layer: layer });
        }
      });
    }

    setTimeout(collectFeatureLayers, 1000); // 保險：確保 geojson 載入完成

    function highlightSearchedPolygons(keyword) {
      window._highlightedLayers.forEach(obj => {
        obj.layer.setStyle({ weight:1, color:getColor(obj.feature), fillOpacity:0.6, opacity:1 });
      });
      window._highlightedLayers = [];
      if (!keyword) return;
      window._featureLayers.forEach(function(obj) {
        const m = obj.feature.properties.管理人 || '';
        if (stripMask(m).indexOf(stripMask(keyword)) !== -1) {
          obj.layer.setStyle({ color:'#FF00EA', weight:5, fillOpacity:0.85, opacity:1 });
          window._highlightedLayers.push(obj);
        } else {
          obj.layer.setStyle({ weight:1, color:getColor(obj.feature), fillOpacity:0.6, opacity:1 });
        }
      });
    }

    document.getElementById('managerSearch').addEventListener('input', function(e) {
      highlightSearchedPolygons(e.target.value.trim());
    });
    document.getElementById('clearHighlight').addEventListener('click', function() {
      window._highlightedLayers.forEach(obj => {
        obj.layer.setStyle({ weight:1, color:getColor(obj.feature), fillOpacity:0.6, opacity:1 });
      });
      window._highlightedLayers = [];
      document.getElementById('managerSearch').value = '';
    });