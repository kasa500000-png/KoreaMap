import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.config.PlanetilerConfig;
import com.onthegomap.planetiler.config.Arguments;
import com.onthegomap.planetiler.reader.SimpleFeature;
import com.onthegomap.planetiler.stats.Stats;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.locationtech.jts.io.WKTReader;

/** Project-authored semantic tests against Planetiler, no copied profile or external data. */
public final class KoreaProfileV2Test {
  private static final KoreaProfileV2 PROFILE = new KoreaProfileV2();
  private static final FeatureCollector.Factory FACTORY = new FeatureCollector.Factory(PlanetilerConfig.from(Arguments.fromArgs(new String[]{"--maxzoom=16"})), Stats.inMemory());
  private static int checks;
  private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
  private static List<FeatureCollector.Feature> process(String shape, Map<String,Object> tags) throws Exception {
    var source = SimpleFeature.createFakeOsmFeature(new WKTReader().read(shape), tags, "osm", null, 123, List.of());
    var collector = FACTORY.get(source); PROFILE.processFeature(source, collector);
    var output = new ArrayList<FeatureCollector.Feature>(); collector.forEach(f -> { if (!f.isEmpty()) output.add(f); }); return output;
  }
  private static FeatureCollector.Feature one(String shape, Map<String,Object> tags, String layer) throws Exception {
    var result = process(shape, tags).stream().filter(f -> f.getLayer().equals(layer)).toList();
    check(result.size() == 1, "one " + layer); return result.getFirst();
  }
  public static void main(String[] args) throws Exception {
    String line = "LINESTRING(127.01 37.51,127.02 37.52)", point = "POINT(127.01 37.51)";
    String polygon = "POLYGON((127.01 37.51,127.02 37.51,127.02 37.52,127.01 37.52,127.01 37.51))";
    String[] roads = {"motorway", "trunk", "primary", "secondary", "tertiary", "residential", "service"};
    int[] zooms = {5, 6, 8, 9, 10, 11, 13};
    for (int i=0;i<roads.length;i++) {
      var road = one(line, Map.of("highway", roads[i]), "road"); var attrs = road.getAttrsAtZoom(16);
      check(road.getMinZoom() == zooms[i] && road.getMaxZoom() == 16, "hierarchy zoom " + roads[i]);
      check(attrs.get("subclass").equals(roads[i]) && attrs.get("class").equals(i<5 ? "major" : "minor"), "legacy class preserved");
      check(attrs.get("fid").equals("way/123"), "stable typed OSM identity");
    }
    var road = one(line, Map.of("highway","primary_link", "bridge","yes", "tunnel","no", "layer","1", "ref","7", "phone","private"), "road").getAttrsAtZoom(16);
    check(road.get("bridge").equals(true) && road.get("tunnel").equals(false) && road.get("layer").equals(1), "structure flags preserve meaning");
    check(road.get("ref").equals("7") && road.get("subclass").equals("primary") && !road.containsKey("phone"), "sanitized public road fields");
    check(one(line, Map.of("highway","service", "layer","999"), "road").getAttrsAtZoom(16).get("layer").equals(0), "invalid layer bounded");
    check(one(line, Map.of("highway","path"), "trail").getMinZoom() == 10, "Outdoor trail data starts z10");
    check(process(polygon, Map.of("highway","pedestrian", "area","yes")).isEmpty(), "area not fabricated line");
    check(one(line, Map.of("railway","rail"), "rail").getMinZoom() == 9, "rail hierarchy");
    check(one(line, Map.of("waterway","river"), "waterway").getMinZoom() == 8, "river hierarchy");
    check(one(line, Map.of("waterway","stream"), "waterway").getMinZoom() == 12, "stream hierarchy");
    check(one(line, Map.of("boundary","administrative", "admin_level","4"), "boundary").getAttrsAtZoom(16).get("admin_level").equals(4), "admin level retained");
    check(!one(line, Map.of("boundary","administrative"), "boundary").getAttrsAtZoom(16).containsKey("admin_level"), "unknown administrative level not fabricated");
    var city = one(point, Map.of("place","city", "name:ko","가상시"), "place");
    check(city.getMinZoom() == 6 && city.getPointLabelGridLimitAtZoom(16) == 1, "city visibility and density at maxzoom");
    check(city.getPointLabelGridPixelSizeAtZoom(6) == 0 && city.getPointLabelGridPixelSizeAtZoom(9) == 0,
      "overview city candidates are not irreversibly grid-filtered");
    check(city.getPointLabelGridPixelSizeAtZoom(10) == 96 && city.getPointLabelGridLimitAtZoom(10) == 1,
      "detail locality density starts exactly z10");
    check(city.getAttrsAtZoom(16).get("fid").equals("node/123"), "node identity distinct from way");
    var capital = one(point, Map.of("place","city", "name:ko","합성수도", "capital","yes", "population","10000000"), "place");
    var majorCity = one(point, Map.of("place","city", "name:ko","합성큰도시", "population","2000000"), "place");
    var smallCity = one(point, Map.of("place","city", "name:ko","합성소도시", "population","10000"), "place");
    var province = one(point, Map.of("place","province", "name:ko","합성도"), "place");
    check(capital.getSortKey() < majorCity.getSortKey() && majorCity.getSortKey() < smallCity.getSortKey()
      && smallCity.getSortKey() < province.getSortKey(), "capital and population priority independent from minzoom");
    check(one(point, Map.of("place","city", "name","Authored admin capital", "capital","4"), "place").getSortKey() < majorCity.getSortKey(), "explicit administrative capital priority");
    for (String population : List.of("", "-1", "0", "1e9", "1.5", "999999999999999999999", "100000001", "1,000,000")) {
      check(one(point, Map.of("place","city", "name","Authored invalid population", "population",population, "capital","999"), "place").getSortKey() == 25,
        "invalid/missing population and capital safely fall back: " + population);
    }
    check(process(point, Map.of("amenity","parking")).isEmpty(), "unnamed POIs excluded");
    var parking = one(point, Map.of("amenity","parking", "name:ko","가상주차장"), "poi");
    var hospital = one(point, Map.of("amenity","hospital", "name:ko","가상병원"), "poi");
    check(parking.getMinZoom() == 15 && hospital.getMinZoom() == 12 && hospital.getSortKey() < parking.getSortKey(), "important POIs ranked first");
    check(parking.getPointLabelGridLimitAtZoom(16) == 1 && parking.getPointLabelGridPixelSizeAtZoom(16) == 64, "POI density through maxzoom");
    check(parking.getAttrsAtZoom(16).get("poi").equals("parking") && hospital.getAttrsAtZoom(16).get("poiCategory").equals("hospital"), "compatible icon and detailed category");
    check(one(point, Map.of("railway","station", "name:ko","가상역"), "transport").getMinZoom() == 12, "named transport");
    check(process(line, Map.of("natural","coastline")).isEmpty(), "no fake ocean from incomplete coastlines");
    check(KoreaProfileV2.label("  \u1100\u1161\u0001상 ").equals("가상"), "Korean NFC and control cleanup");
    check(KoreaProfileV2.FIELDS.containsAll(hospital.getAttrsAtZoom(16).keySet()), "closed field schema");
    System.out.println("PASS KoreaProfileV2: " + checks + " authored hierarchy/density/identity checks");
  }
}
