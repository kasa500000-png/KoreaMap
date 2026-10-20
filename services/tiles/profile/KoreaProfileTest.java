import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.config.PlanetilerConfig;
import com.onthegomap.planetiler.reader.SimpleFeature;
import com.onthegomap.planetiler.stats.Stats;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.io.WKTReader;

/** Authored fixture checks run against the pinned real Planetiler API; no JUnit download. */
public final class KoreaProfileTest {
  private static final KoreaProfile PROFILE = new KoreaProfile();
  private static final FeatureCollector.Factory FACTORY =
    new FeatureCollector.Factory(PlanetilerConfig.defaults(), Stats.inMemory());
  private static final String POINT = "POINT (127.01 37.51)";
  private static final String LINE = "LINESTRING (127.01 37.51, 127.02 37.52)";
  private static final String POLYGON = "POLYGON ((127.01 37.51, 127.03 37.51, 127.03 37.53, 127.01 37.53, 127.01 37.51),"
    + "(127.015 37.515, 127.015 37.52, 127.02 37.52, 127.02 37.515, 127.015 37.515))";
  private static int checks;

  private static void check(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
    checks++;
  }
  private static List<FeatureCollector.Feature> process(String wkt, Map<String, Object> tags) throws Exception {
    var input = SimpleFeature.createFakeOsmFeature(new WKTReader().read(wkt), tags, "osm", null, 1, List.of());
    var collector = FACTORY.get(input);
    PROFILE.processFeature(input, collector);
    var result = new ArrayList<FeatureCollector.Feature>();
    collector.forEach(feature -> { if (!feature.isEmpty()) result.add(feature); });
    return result;
  }
  private static FeatureCollector.Feature one(String wkt, Map<String, Object> tags, String layer) throws Exception {
    var result = process(wkt, tags).stream().filter(feature -> feature.getLayer().equals(layer)).toList();
    check(result.size() == 1, "one feature in " + layer);
    return result.getFirst();
  }
  public static void main(String[] args) throws Exception {
    var major = one(LINE, Map.of("highway", "primary", "name:ko", "가상 큰길", "name", "Authored street", "phone", "private"), "road");
    check(major.getAttrsAtZoom(14).get("class").equals("major"), "major road class");
    check(major.getAttrsAtZoom(14).get("kind").equals("road"), "kind matches source-layer");
    check(major.getAttrsAtZoom(14).get("name:ko").equals("가상 큰길"), "Korean name preserved");
    check(!major.getAttrsAtZoom(14).containsKey("phone"), "contact tag excluded");
    check(one(LINE, Map.of("highway", "service"), "road").getAttrsAtZoom(14).get("class").equals("minor"), "minor road class");
    check(one(LINE, Map.of("highway", "footway"), "trail").getMinZoom() == 12, "trail zoom");
    check(process(POLYGON, Map.of("highway", "pedestrian", "area", "yes")).isEmpty(), "pedestrian area not a fabricated line");
    var water = one(POLYGON, Map.of("natural", "water"), "water");
    check(water.isPolygon() && ((Polygon) water.getGeometry()).getNumInteriorRing() == 1, "water hole preserved");
    check(one(POLYGON, Map.of("landuse", "residential"), "land").isPolygon(), "land polygon");
    check(one(POLYGON, Map.of("leisure", "park"), "park").isPolygon(), "park polygon");
    check(one(POLYGON, Map.of("building", "yes"), "building").isPolygon(), "building polygon");
    check(process(POLYGON, Map.of("building", "no")).isEmpty(), "building=no omitted");
    check(one(LINE, Map.of("boundary", "administrative"), "boundary").isLine(), "boundary line");
    check(one(POLYGON, Map.of("boundary", "administrative"), "boundary").isPolygon(), "polygon boundary outline");
    var place = one(POINT, Map.of("place", "city", "name:ko", "가상시", "name", "Authored city"), "place");
    check(place.getMinZoom() == 6, "city appears before small locality");
    check(process(POINT, Map.of("place", "city")).isEmpty(), "unnamed place omitted");
    check(one(POINT, Map.of("amenity", "parking"), "poi").getAttrsAtZoom(14).get("poi").equals("parking"), "parking icon category");
    check(one(POINT, Map.of("highway", "trailhead"), "poi").getAttrsAtZoom(14).get("poi").equals("trail"), "trail icon category");
    check(one(POINT, Map.of("amenity", "veterinary"), "poi").getAttrsAtZoom(14).get("poi").equals("facility"), "veterinary category");
    check(one(POLYGON, Map.of("leisure", "park", "name", "Authored park"), "poi").getGeometry().getGeometryType().equals("Point"), "named polygon label is a point");
    check(process(POINT, Map.of("amenity", "unknown", "email", "private")).isEmpty(), "unreviewed POI category omitted");
    check(KoreaProfile.label("  \u1100\u1161\u0001상  ").equals("가상"), "NFC and control character cleanup");
    check(KoreaProfile.label("😀".repeat(200)).codePointCount(0, KoreaProfile.label("😀".repeat(200)).length()) == 160, "name length cap preserves code points");
    check(KoreaProfile.label(123).isEmpty(), "non-string names omitted");
    check(KoreaProfile.LAYERS.equals(Set.of("land", "park", "water", "building", "boundary", "road", "trail", "place", "poi")), "exact style binding layers");
    check(PROFILE.attribution().contains("OpenStreetMap") && PROFILE.attribution().contains("ODbL"), "data attribution separated from code MIT");
    System.out.println("PASS KoreaProfile: " + checks + " authored checks against Planetiler 0.10.2");
  }
}
