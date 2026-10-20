import com.onthegomap.planetiler.VectorTile;
import java.io.ByteArrayInputStream;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Set;
import java.util.zip.GZIPInputStream;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.Polygon;

/** Decodes the actual MBTiles produced from the authored PBF; no source/renderer mocks. */
public final class KoreaArchiveTest {
  private static void require(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
  }
  private static boolean hasHole(Geometry geometry) {
    if (geometry instanceof Polygon polygon) return polygon.getNumInteriorRing() > 0;
    if (geometry.getNumGeometries() > 1) {
      for (int i = 0; i < geometry.getNumGeometries(); i++)
        if (hasHole(geometry.getGeometryN(i))) return true;
    }
    return false;
  }
  public static void main(String[] args) throws Exception {
    if (args.length < 1 || args.length > 2) throw new IllegalArgumentException("Pass fixture MBTiles path and optional design-v2");
    boolean v2 = args.length == 2 && args[1].equals("design-v2");
    String uri = "jdbc:sqlite:" + Path.of(args[0]).toAbsolutePath().toUri() + "?mode=ro";
    var kinds = new HashSet<String>();
    var roadClasses = new HashSet<String>();
    var allowed = v2 ? KoreaProfileV2.FIELDS : Set.of("kind", "class", "poi", "name:ko", "name", "name:en");
    var expectedLayers = v2 ? KoreaProfileV2.LAYERS : KoreaProfile.LAYERS;
    boolean korean = false, english = false, waterHole = false, parking = false;
    boolean bridge = false, relationId = false, station = false, maxzoom = false;
    var nodeIds = new HashSet<String>(); var wayIds = new HashSet<String>();
    var maxzoomParkingIds = new HashSet<String>(); var maxzoomStationIds = new HashSet<String>();
    var overviewNames = Set.of("합성수도", "합성큰도시", "합성소도시", "합성도");
    var overviewRanks = new HashMap<String,Integer>(); var overviewIds = new HashMap<String,Long>();
    var overviewNamesByTile = new HashMap<String,HashSet<String>>();
    var overviewPointsByTile = new HashMap<String,HashSet<String>>();
    var detailedCompetitors = new HashMap<Integer,HashSet<String>>();
    int tiles = 0, features = 0;
    try (var connection = DriverManager.getConnection(uri);
         var query = connection.createStatement()) {
      try (var metadata = query.executeQuery("SELECT value FROM metadata WHERE name='attribution'")) {
        require(metadata.next(), "attribution metadata exists");
        require(metadata.getString(1).contains("OpenStreetMap") && metadata.getString(1).contains("ODbL"), "ODbL attribution retained");
      }
      try (var result = query.executeQuery("SELECT zoom_level,tile_data,tile_column,tile_row FROM tiles")) {
        while (result.next()) {
          tiles++;
          int zoom = result.getInt(1);
          require(zoom >= 0 && zoom <= (v2 ? 16 : 14), "zoom within pipeline contract");
          maxzoom |= zoom == (v2 ? 16 : 14);
          byte[] raw = result.getBytes(2);
          if (raw.length > 2 && (raw[0] & 255) == 31 && (raw[1] & 255) == 139) {
            try (var gzip = new GZIPInputStream(new ByteArrayInputStream(raw))) {
              raw = gzip.readNBytes(8 * 1024 * 1024 + 1);
            }
          }
          require(raw.length <= 8 * 1024 * 1024, "bounded tile decoding");
          for (var feature : VectorTile.decode(raw)) {
            features++;
            require(expectedLayers.contains(feature.layer()), "known source-layer");
            require(feature.layer().equals(feature.tags().get("kind")), "kind matches source-layer");
            require(allowed.containsAll(feature.tags().keySet()), "only public schema properties");
            kinds.add(feature.layer());
            if (feature.layer().equals("road")) roadClasses.add((String) feature.tags().get("class"));
            korean |= "합성시".equals(feature.tags().get("name:ko"));
            english |= "Authored City English".equals(feature.tags().get("name:en"));
            parking |= "parking".equals(feature.tags().get("poi"));
            if (feature.layer().equals("water")) waterHole |= hasHole(feature.geometry().decode());
            if (v2) {
              String fid = String.valueOf(feature.tags().get("fid"));
              require(fid.matches("(node|way|relation)/[1-9][0-9]*"), "typed stable source identity");
              require(feature.tags().get("rank") instanceof Number && feature.tags().get("minzoom") instanceof Number,
                "rank and minimum zoom are numeric");
              require(((Number) feature.tags().get("minzoom")).intValue() <= zoom, "feature respects minimum zoom");
              if (fid.startsWith("node/")) nodeIds.add(fid);
              if (fid.startsWith("way/")) wayIds.add(fid);
              relationId |= fid.equals("relation/200");
              bridge |= feature.layer().equals("road") && Boolean.TRUE.equals(feature.tags().get("bridge"))
                && "7".equals(feature.tags().get("ref")) && "motorway".equals(feature.tags().get("subclass"));
              station |= feature.layer().equals("transport") && "station".equals(feature.tags().get("subclass"));
              if (zoom == 16 && "parking".equals(feature.tags().get("poi"))) maxzoomParkingIds.add(fid);
              if (zoom == 16 && feature.layer().equals("transport")) maxzoomStationIds.add(fid);
              String ko = String.valueOf(feature.tags().get("name:ko"));
              if (zoom == 6 && feature.layer().equals("place") && overviewNames.contains(ko)) {
                require(fid.startsWith("node/"), "overview names preserve original node identity");
                overviewRanks.put(ko, ((Number) feature.tags().get("rank")).intValue());
                overviewIds.put(ko, Long.parseLong(fid.substring(5)));
                String tileKey = result.getInt(3) + "/" + result.getInt(4);
                overviewNamesByTile.computeIfAbsent(tileKey, k -> new HashSet<>()).add(ko);
                overviewPointsByTile.computeIfAbsent(tileKey, k -> new HashSet<>()).add(feature.geometry().decode().toText());
              }
              if ((zoom == 10 || zoom == 16) && feature.layer().equals("place") && overviewNames.contains(ko))
                detailedCompetitors.computeIfAbsent(zoom, k -> new HashSet<>()).add(ko);
              if (feature.layer().equals("poi"))
                require(feature.tags().containsKey("name:ko") || feature.tags().containsKey("name") || feature.tags().containsKey("name:en"), "unnamed POIs absent");
            }
          }
        }
      }
    }
    require(kinds.equals(expectedLayers), "all style source-layers emitted from real PBF");
    require(roadClasses.equals(Set.of("major", "minor")), "both road classes emitted");
    require(korean && english, "Korean and fallback names survive PBF to MVT");
    require(parking, "POI icon category survives PBF to MVT");
    require(waterHole, "OSM multipolygon inner ring survives relation assembly to MVT");
    require(maxzoom, "requested maximum zoom contains real tiles");
    if (v2) require(bridge && relationId && station && !nodeIds.isEmpty() && !wayIds.isEmpty(), "modern attributes and original OSM identities survive encoding");
    if (v2) require(maxzoomParkingIds.size() == 1 && maxzoomStationIds.size() == 1,
      "clustered named POI/transport competitors are suppressed even at z16");
    if (v2) {
      require(overviewRanks.keySet().equals(overviewNames), "all same-grid capital/city/province candidates survive actual z6 encoding");
      require(overviewNamesByTile.entrySet().stream().anyMatch(e -> e.getValue().equals(overviewNames)
        && overviewPointsByTile.get(e.getKey()).size() == 1), "all overview competitors occupy the same quantized point/grid cell");
      require(overviewRanks.get("합성수도") < overviewRanks.get("합성큰도시")
        && overviewRanks.get("합성큰도시") < overviewRanks.get("합성소도시")
        && overviewRanks.get("합성소도시") < overviewRanks.get("합성도"), "capital/population ranks survive MVT encoding");
      require(overviewIds.get("합성소도시") < overviewIds.get("합성큰도시")
        && overviewIds.get("합성큰도시") < overviewIds.get("합성수도"), "importance wins despite reversed original OSM ID order");
      require(Set.of("합성수도").equals(detailedCompetitors.get(10)) && Set.of("합성수도").equals(detailedCompetitors.get(16)),
        "detail grids retain the capital over lower-ID competitors at z10 and z16");
    }
    System.out.println("PASS KoreaArchive" + (v2 ? "V2" : "") + ": " + tiles + " tiles / " + features + " decoded features / " + kinds.size() + " layers / multipolygon hole");
  }
}
