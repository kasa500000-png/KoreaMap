import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.Planetiler;
import com.onthegomap.planetiler.Profile;
import com.onthegomap.planetiler.config.Arguments;
import com.onthegomap.planetiler.reader.SourceFeature;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.Set;

/** Original Korea Map Kit design-v1 profile. MIT code; OSM output remains ODbL. */
public final class KoreaProfile implements Profile {
  public static final String SCHEMA = "design-v1";
  public static final Set<String> LAYERS = Set.of(
    "land", "park", "water", "building", "boundary", "road", "trail", "place", "poi");
  private static final Set<String> MAJOR = Set.of(
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link");
  private static final Set<String> MINOR = Set.of(
    "residential", "unclassified", "living_street", "service", "road");
  private static final Set<String> TRAILS = Set.of(
    "path", "footway", "cycleway", "bridleway", "steps", "track", "pedestrian");
  private static final Set<String> PARK_LANDUSE = Set.of(
    "forest", "grass", "meadow", "recreation_ground", "village_green");
  private static final Set<String> LANDUSE = Set.of(
    "residential", "commercial", "industrial", "retail", "farmland", "farmyard",
    "orchard", "allotments", "cemetery", "construction", "brownfield", "railway");
  private static final Set<String> FACILITIES = Set.of(
    "hospital", "clinic", "doctors", "veterinary", "pharmacy", "toilets", "school",
    "library", "community_centre", "townhall", "police", "fire_station", "shelter",
    "drinking_water", "bicycle_parking", "bus_station");

  static String label(Object value) {
    if (!(value instanceof String text)) return "";
    text = Normalizer.normalize(text, Normalizer.Form.NFC)
      .replaceAll("[\\p{Cc}\\p{Cf}]", "").strip();
    if (text.codePointCount(0, text.length()) > 160)
      text = text.substring(0, text.offsetByCodePoints(0, 160));
    return text;
  }

  private static String tag(SourceFeature source, String key) {
    return source.getString(key, "");
  }

  private static boolean named(SourceFeature source) {
    return !label(source.getTag("name:ko")).isEmpty() || !label(source.getTag("name")).isEmpty()
      || !label(source.getTag("name:en")).isEmpty();
  }

  private static FeatureCollector.Feature attrs(FeatureCollector.Feature feature,
      SourceFeature source, String kind, int minzoom) {
    feature.setAttr("kind", kind).setZoomRange(minzoom, 14).setBufferPixels(8);
    for (String key : new String[]{"name:ko", "name", "name:en"}) {
      String value = label(source.getTag(key));
      if (!value.isEmpty()) feature.setAttr(key, value);
    }
    return feature;
  }

  private static boolean park(SourceFeature source) {
    return source.hasTag("leisure", "park", "garden", "nature_reserve", "dog_park")
      || PARK_LANDUSE.contains(tag(source, "landuse"))
      || source.hasTag("natural", "wood", "grassland", "scrub", "heath");
  }

  private static String poi(SourceFeature source) {
    if (park(source) && named(source)) return "park";
    if (source.hasTag("amenity", "parking", "parking_entrance")) return "parking";
    if (source.hasTag("highway", "trailhead") || source.hasTag("information", "guidepost"))
      return "trail";
    if (FACILITIES.contains(tag(source, "amenity")) || source.hasTag("tourism", "attraction", "museum", "viewpoint"))
      return "facility";
    return "";
  }

  private static int placeMinZoom(String value) {
    return switch (value) {
      case "country" -> 3;
      case "state", "province" -> 5;
      case "city" -> 6;
      case "town" -> 8;
      case "village" -> 10;
      case "suburb", "borough", "quarter" -> 11;
      case "neighbourhood", "hamlet", "locality", "island", "islet" -> 12;
      default -> 14;
    };
  }

  @Override public void processFeature(SourceFeature source, FeatureCollector features) {
    if (source.canBePolygon()) {
      if (LANDUSE.contains(tag(source, "landuse")) || source.hasTag("natural", "sand", "beach", "bare_rock"))
        attrs(features.polygon("land"), source, "land", 5).setMinPixelSize(1);
      if (park(source)) attrs(features.polygon("park"), source, "park", 7).setMinPixelSize(1);
      if (source.hasTag("natural", "water") || source.hasTag("waterway", "riverbank")
          || source.hasTag("landuse", "reservoir", "basin"))
        attrs(features.polygon("water"), source, "water", 0).setMinPixelSize(1);
      if (source.hasTag("building") && !source.hasTag("building", "no"))
        attrs(features.polygon("building"), source, "building", 12).setMinPixelSize(1);
    }
    if (source.hasTag("boundary", "administrative")) {
      if (source.canBeLine()) attrs(features.line("boundary"), source, "boundary", 5);
      else if (source.canBePolygon()) attrs(features.polygon("boundary"), source, "boundary", 5);
    }
    if (source.canBeLine() && !source.hasTag("area", "yes")) {
      String highway = tag(source, "highway");
      if (MAJOR.contains(highway))
        attrs(features.line("road"), source, "road", 5).setAttr("class", "major");
      else if (MINOR.contains(highway))
        attrs(features.line("road"), source, "road", 12).setAttr("class", "minor");
      else if (TRAILS.contains(highway))
        attrs(features.line("trail"), source, "trail", 12);
    }
    if (source.isPoint() || source.canBePolygon()) {
      if (source.hasTag("place") && named(source)) {
        int zoom = placeMinZoom(tag(source, "place"));
        attrs(source.isPoint() ? features.point("place") : features.pointOnSurface("place"),
          source, "place", zoom).setSortKey(zoom)
          .setPointLabelGridSizeAndLimit(11, 64, 1).setBufferPixels(64);
      }
      String category = poi(source);
      if (!category.isEmpty()) {
        attrs(source.isPoint() ? features.point("poi") : features.pointOnSurface("poi"),
          source, "poi", 13).setAttr("poi", category)
          .setPointLabelGridSizeAndLimit(13, 32, 2).setBufferPixels(32);
      }
    }
  }

  @Override public String name() { return "Korea Map Kit"; }
  @Override public String description() {
    return "Project-authored design-v1 OSM profile; inland water only; no ocean polygons";
  }
  @Override public String attribution() { return "© OpenStreetMap contributors · ODbL-1.0"; }
  @Override public String version() { return "0.1.0"; }

  public static void main(String[] args) {
    Arguments arguments = Arguments.fromArgs(args);
    Planetiler.create(arguments).setProfile(new KoreaProfile())
      .addOsmSource("osm", Path.of("data", "operator-input.osm.pbf"))
      .setOutput(Path.of("data", "operator-output.mbtiles"))
      .run();
  }
}
