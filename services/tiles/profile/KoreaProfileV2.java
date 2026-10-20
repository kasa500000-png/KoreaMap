import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.Planetiler;
import com.onthegomap.planetiler.Profile;
import com.onthegomap.planetiler.config.Arguments;
import com.onthegomap.planetiler.reader.SourceFeature;
import com.onthegomap.planetiler.reader.osm.OsmSourceFeature;
import com.onthegomap.planetiler.util.ZoomFunction;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/** Original design-v2 cartographic profile. MIT code; generated OSM data remains ODbL. */
public final class KoreaProfileV2 implements Profile {
  public static final String SCHEMA = "design-v2";
  public static final int REVISION = 1;
  public static final Set<String> LAYERS = Set.of(
    "land", "park", "water", "building", "boundary", "road", "trail", "place", "poi",
    "rail", "waterway", "transport");
  public static final Set<String> FIELDS = Set.of("kind", "class", "poi", "name:ko", "name", "name:en",
    "fid", "subclass", "rank", "minzoom", "bridge", "tunnel", "layer", "ref", "admin_level", "poiCategory");
  private static final Set<String> TRAILS = Set.of("path", "footway", "cycleway", "bridleway", "steps", "track", "pedestrian");
  private static final Set<String> PARK_LANDUSE = Set.of("forest", "grass", "meadow", "recreation_ground", "village_green");
  private static final Set<String> LANDUSE = Set.of("residential", "commercial", "industrial", "retail", "farmland",
    "farmyard", "orchard", "allotments", "cemetery", "construction", "brownfield", "railway");
  private static final Set<String> FACILITIES = Set.of("hospital", "clinic", "doctors", "veterinary", "pharmacy", "toilets", "school",
    "university", "college", "library", "community_centre", "townhall", "police", "fire_station", "shelter",
    "drinking_water", "bicycle_parking");

  static String label(Object value) {
    if (!(value instanceof String text)) return "";
    text = Normalizer.normalize(text, Normalizer.Form.NFC).replaceAll("[\\p{Cc}\\p{Cf}]", "").strip();
    return text.codePointCount(0, text.length()) > 160 ? text.substring(0, text.offsetByCodePoints(0, 160)) : text;
  }
  private static String tag(SourceFeature source, String key) { return source.getString(key, ""); }
  private static boolean named(SourceFeature source) {
    return !label(source.getTag("name:ko")).isEmpty() || !label(source.getTag("name")).isEmpty()
      || !label(source.getTag("name:en")).isEmpty();
  }
  static String fid(SourceFeature source) {
    if (source instanceof OsmSourceFeature<?> osm) {
      var element = osm.originalElement();
      return element.type().name().toLowerCase(Locale.ROOT) + "/" + element.id();
    }
    // Synthetic unit inputs have no original element. Production input is always OSM.
    return (source.isPoint() ? "node/" : "way/") + source.id();
  }
  private static FeatureCollector.Feature attrs(FeatureCollector.Feature feature, SourceFeature source,
      String kind, String subclass, int minzoom, int rank) {
    feature.setAttr("kind", kind).setAttr("fid", fid(source)).setAttr("subclass", subclass)
      .setAttr("rank", rank).setAttr("minzoom", minzoom).setSortKey(rank)
      .setZoomRange(minzoom, 16).setBufferPixels(8).setPixelTolerance(0.5);
    for (String key : new String[]{"name:ko", "name", "name:en"}) {
      String value = label(source.getTag(key));
      if (!value.isEmpty()) feature.setAttr(key, value);
    }
    return feature;
  }
  private static int number(SourceFeature source, String key, int fallback, int min, int max) {
    try { int value = Integer.parseInt(tag(source, key)); return value >= min && value <= max ? value : fallback; }
    catch (NumberFormatException ignored) { return fallback; }
  }
  private static boolean enabled(SourceFeature source, String key) {
    return source.hasTag(key) && !source.hasTag(key, "no", "false", "0");
  }
  private static FeatureCollector.Feature transportAttrs(FeatureCollector.Feature feature, SourceFeature source) {
    feature.setAttr("bridge", enabled(source, "bridge")).setAttr("tunnel", enabled(source, "tunnel"))
      .setAttr("layer", number(source, "layer", 0, -5, 5));
    String reference = label(source.getTag("ref"));
    if (!reference.isEmpty()) feature.setAttr("ref", reference);
    return feature;
  }
  private static String parkSubclass(SourceFeature source) {
    if (source.hasTag("leisure", "park", "garden", "nature_reserve", "dog_park")) return tag(source, "leisure");
    if (PARK_LANDUSE.contains(tag(source, "landuse"))) return tag(source, "landuse");
    if (source.hasTag("natural", "wood", "grassland", "scrub", "heath")) return tag(source, "natural");
    return "";
  }
  static int roadMinZoom(String highway) {
    String base = highway.replace("_link", "");
    return switch (base) {
      case "motorway" -> 5; case "trunk" -> 6; case "primary" -> 8; case "secondary" -> 9;
      case "tertiary" -> 10; case "residential", "unclassified", "living_street", "road" -> 11;
      case "service" -> 13; default -> -1;
    };
  }
  private static int placeMinZoom(String place) {
    return switch (place) {
      case "country" -> 3; case "state", "province" -> 5; case "city" -> 6; case "town" -> 8;
      case "village" -> 10; case "suburb", "borough", "quarter" -> 11;
      case "neighbourhood", "hamlet", "locality", "island", "islet" -> 12; default -> 14;
    };
  }
  // Population is a bounded integer priority hint, never an inferred/current population claim.
  private static int populationTier(SourceFeature source) {
    String value = tag(source, "population");
    if (!value.matches("[0-9]{1,9}")) return 5;
    long population;
    try { population = Long.parseLong(value); } catch (NumberFormatException ignored) { return 5; }
    if (population <= 0 || population > 100_000_000) return 5;
    if (population >= 5_000_000) return 0;
    if (population >= 1_000_000) return 1;
    if (population >= 500_000) return 2;
    if (population >= 100_000) return 3;
    return 4;
  }
  private static int placeRank(SourceFeature source, String place, int zoom) {
    if (place.equals("country")) return 5;
    if (place.equals("city") || place.equals("town")) {
      if (source.hasTag("capital", "yes", "2")) return 0;
      if (source.hasTag("capital", "4")) return 10 + populationTier(source);
      if (source.hasTag("capital", "6")) return 15 + populationTier(source);
      if (place.equals("city")) return 20 + populationTier(source);
      return 80 + populationTier(source);
    }
    return zoom * 10;
  }
  private record Poi(String category, String icon, int zoom, int rank) {}
  private static Poi poi(SourceFeature source) {
    if (!parkSubclass(source).isEmpty()) return new Poi("park", "park", 13, 30);
    String amenity = tag(source, "amenity");
    if (source.hasTag("amenity", "hospital", "university")) return new Poi(amenity, "facility", 12, 20);
    if (source.hasTag("tourism", "attraction", "museum", "viewpoint")) return new Poi(tag(source, "tourism"), "facility", 13, 30);
    if (source.hasTag("amenity", "parking", "parking_entrance")) return new Poi("parking", "parking", 15, 60);
    if (source.hasTag("highway", "trailhead") || source.hasTag("information", "guidepost")) return new Poi("trail", "trail", 14, 45);
    if (FACILITIES.contains(amenity)) return new Poi(amenity, "facility",
      source.hasTag("amenity", "toilets", "drinking_water", "bicycle_parking") ? 15 : 14, 50);
    return null;
  }
  private static String transport(SourceFeature source) {
    if (source.hasTag("railway", "station", "halt", "subway_entrance")) return tag(source, "railway");
    if (source.hasTag("amenity", "bus_station", "ferry_terminal")) return tag(source, "amenity");
    if (source.hasTag("highway", "bus_stop")) return "bus_stop";
    if (source.hasTag("aeroway", "aerodrome", "terminal")) return tag(source, "aeroway");
    return "";
  }
  @Override public void processFeature(SourceFeature source, FeatureCollector features) {
    if (source.canBePolygon()) {
      String landuse = tag(source, "landuse"), natural = tag(source, "natural"), park = parkSubclass(source);
      if (LANDUSE.contains(landuse) || source.hasTag("natural", "sand", "beach", "bare_rock"))
        attrs(features.polygon("land"), source, "land", landuse.isEmpty() ? natural : landuse, 5, 50).setMinPixelSize(2);
      if (!park.isEmpty()) attrs(features.polygon("park"), source, "park", park, 7, 40).setMinPixelSize(2);
      if (source.hasTag("natural", "water") || source.hasTag("waterway", "riverbank") || source.hasTag("landuse", "reservoir", "basin"))
        attrs(features.polygon("water"), source, "water", source.hasTag("water") ? tag(source, "water") : "water", 0, 20).setMinPixelSize(1);
      if (source.hasTag("building") && !source.hasTag("building", "no"))
        attrs(features.polygon("building"), source, "building", tag(source, "building"), 13, 60).setMinPixelSize(1);
    }
    if (source.hasTag("boundary", "administrative") && (source.canBeLine() || source.canBePolygon())) {
      int level = number(source, "admin_level", 0, 2, 12), zoom = level > 0 && level <= 4 ? 4 : level > 0 && level <= 6 ? 7 : 10;
      var boundary = attrs(source.canBeLine() ? features.line("boundary") : features.polygon("boundary"), source,
        "boundary", "administrative", zoom, level > 0 ? level : 8);
      if (level > 0) boundary.setAttr("admin_level", level);
    }
    if (source.canBeLine() && !source.hasTag("area", "yes")) {
      String highway = tag(source, "highway"); int zoom = roadMinZoom(highway);
      if (zoom >= 0) {
        String subclass = highway.replace("_link", "");
        transportAttrs(attrs(features.line("road"), source, "road", subclass, zoom, zoom * 10), source)
          .setAttr("class", zoom <= 10 ? "major" : "minor");
      } else if (TRAILS.contains(highway))
        transportAttrs(attrs(features.line("trail"), source, "trail", highway, 10, 100), source);
      if (source.hasTag("railway", "rail", "light_rail", "subway", "tram", "narrow_gauge")) {
        String railway = tag(source, "railway");
        transportAttrs(attrs(features.line("rail"), source, "rail", railway,
          railway.equals("rail") ? 9 : railway.equals("tram") ? 13 : 11, 80), source);
      }
      if (source.hasTag("waterway", "river", "stream", "canal", "drain", "ditch")) {
        String waterway = tag(source, "waterway");
        attrs(features.line("waterway"), source, "waterway", waterway,
          waterway.equals("river") ? 8 : waterway.equals("canal") ? 10 : 12, 30);
      }
    }
    if (source.isPoint() || source.canBePolygon()) {
      if (source.hasTag("place") && named(source)) {
        String place = tag(source, "place"); int zoom = placeMinZoom(place);
        attrs(source.isPoint() ? features.point("place") : features.pointOnSurface("place"), source, "place", place, zoom, placeRank(source, place, zoom))
          // Keep all overview candidates for renderer collision placement; cap detailed localities only.
          .setPointLabelGridPixelSize(ZoomFunction.zoomRange(10, 16, 96))
          .setPointLabelGridLimit(ZoomFunction.zoomRange(10, 16, 1)).setBufferPixels(96);
      }
      // Labels compete at every emitted zoom, including z16. Anonymous facilities do not crowd the basemap.
      if (named(source)) {
        Poi poi = poi(source);
        if (poi != null) attrs(source.isPoint() ? features.point("poi") : features.pointOnSurface("poi"), source,
          "poi", poi.category(), poi.zoom(), poi.rank()).setAttr("poi", poi.icon()).setAttr("poiCategory", poi.category())
          .setPointLabelGridSizeAndLimit(16, 64, 1).setBufferPixels(64);
        String transport = transport(source);
        if (!transport.isEmpty()) {
          int zoom = transport.equals("aerodrome") ? 10 : transport.equals("bus_stop") || transport.equals("subway_entrance") ? 14 : 12;
          attrs(source.isPoint() ? features.point("transport") : features.pointOnSurface("transport"), source,
            "transport", transport, zoom, 10).setAttr("poiCategory", "transport")
            .setPointLabelGridSizeAndLimit(16, 64, 1).setBufferPixels(64);
        }
      }
    }
  }
  @Override public String name() { return "Korea Map Kit design-v2"; }
  @Override public String description() { return "Original ranked OSM cartography; inland water only; no ocean or landmask polygons"; }
  @Override public String attribution() { return "© OpenStreetMap contributors · ODbL-1.0"; }
  @Override public String version() { return "2.1.0"; }
  public static void main(String[] args) {
    Planetiler.create(Arguments.fromArgs(args)).setProfile(new KoreaProfileV2())
      .addOsmSource("osm", Path.of("data", "operator-input.osm.pbf"))
      .setOutput(Path.of("data", "operator-output.mbtiles")).run();
  }
}
