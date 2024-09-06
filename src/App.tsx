import { useState, useEffect, useRef, useMemo, MutableRefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DefaultPluginUISpec,
  PluginUISpec,
} from "molstar/lib/mol-plugin-ui/spec";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { PluginConfig } from "molstar/lib/mol-plugin/config";
import symbolUniprotMapping from "@/lib/symbol_uniprot_mapping.txt";
import "molstar/lib/mol-plugin-ui/skin/light.scss";
import { Search, ExternalLink, ChevronDown, Loader2 } from "lucide-react";

const MySpec: PluginUISpec = {
  ...DefaultPluginUISpec(),
  config: [
    [PluginConfig.VolumeStreaming.Enabled, false],
    [PluginConfig.Viewport.ShowControls, false],
    [PluginConfig.Viewport.ShowSelectionMode, false],
  ],
  layout: {
    initial: {
      showControls: false,
    },
  },
  components: {
    hideTaskOverlay: true,
  },
};

async function fetchUniProtData(uniprotId: string) {
  const response = await fetch(
    `https://rest.uniprot.org/uniprotkb/${uniprotId}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch UniProt data");
  }
  return response.json();
}

async function createPlugin(parent: HTMLElement, dataUrl: string) {
  const plugin = await createPluginUI({
    target: parent,
    spec: MySpec,
    render: renderReact18,
  });

  const data = await plugin.builders.data.download(
    { url: dataUrl },
    { state: { isGhost: true } }
  );
  const trajectory = await plugin.builders.structure.parseTrajectory(
    data,
    "mmcif"
  );
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");

  return plugin;
}

function ProteinViewer({ dataUrl }: { dataUrl: string }) {
  const viewerRef: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const pluginRef: MutableRefObject<any | null> = useRef(null);

  useEffect(() => {
    if (!viewerRef.current || !dataUrl) return;

    createPlugin(viewerRef.current, dataUrl).then((plugin) => {
      pluginRef.current = plugin;
    });

    return () => {
      if (pluginRef.current) {
        pluginRef.current.dispose();
      }
    };
  }, [dataUrl]);

  return (
    <div
      ref={viewerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        zIndex: 1000,
      }}
    />
  );
}

function renderLinks(text: string) {
  // Step 1: Replace PubMed references
  const pubmedReplaced = text.replace(
    /\(PubMed:(\d+)(?:,\s*PubMed:(\d+))*\)/g,
    (match) => {
      const ids = match.match(/\d+/g);
      if (!ids) return match;
      return (
        "(" +
        ids
          .map(
            (id) =>
              `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800">PubMed:${id}<span class="inline-block align-text-bottom ml-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></span></a>`
          )
          .join(", ") +
        ")"
      );
    }
  );

  // Step 2: Apply other replacements
  return pubmedReplaced
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800">$1<span class="inline-block align-text-bottom ml-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></span></a>'
    )
    .replace(/\. /g, ".<br>");
}

export default function App() {
  const [input, setInput] = useState("");
  const [proteinData, setProteinData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableStructures, setAvailableStructures] = useState<any[]>([]);
  const [selectedStructureURL, setSelectedStructureURL] = useState<string>("");
  const [selectedStructureID, setSelectedStructureID] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleModelClick = (model_url: string) => {
    setSelectedStructureURL(model_url);
    setIsDialogOpen(false);
  };
  const fetchSymbolToUniprotMap = async (): Promise<{
    [key: string]: string;
  }> => {
    try {
      const response = await fetch(symbolUniprotMapping);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      const lines = text.split("\n");
      const mapping: { [key: string]: string } = {};
      lines.forEach((line) => {
        const [symbol, uniprotId] = line.split(",");
        if (symbol && uniprotId) {
          mapping[symbol] = uniprotId;
        }
      });
      return mapping;
    } catch (error) {
      console.error("Error loading mapping file:", error);
      return {};
    }
  };

  const symbolToUniprotMap = useMemo(() => {
    const loadMapping = async () => {
      return await fetchSymbolToUniprotMap();
    };

    return loadMapping();
  }, []);

  const handleFetchData = async () => {
    setIsLoading(true);
    setLoading(true);
    setError(null);
    try {
      let query = input.trim();
      const isUniprot = /^[A-Z0-9]{6,10}$/.test(query);

      if (!isUniprot) {
        console.log("Querying for Gene Symbol:", query);
        const mapping = await symbolToUniprotMap;
        if (mapping[query]) {
          query = mapping[query];
          console.log("Mapped UniProt ID:", query);
        } else {
          throw new Error("No UniProt ID found for the given Gene Symbol.");
        }
      }

      // Fetch UniProt data
      const uniProtData = await fetchUniProtData(query);
      setProteinData(uniProtData);

      // Fetch 3D model data
      const modelResponse = await fetch(
        `https://www.ebi.ac.uk/pdbe/pdbe-kb/3dbeacons/api/v2/uniprot/summary/${query}.json`
      );
      const modelData = await modelResponse.json();
      if (
        modelData &&
        modelData.structures &&
        modelData.structures.length > 0
      ) {
        setAvailableStructures(modelData.structures);
        setSelectedStructureURL(modelData.structures[0].summary.model_url);
        setSelectedStructureID(
          modelData.structures[0].summary.model_identifier
        );
        console.log("Model data fetched:", modelData.structures[0]);
      }
      setHasSearched(true);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setLoading(false);
      setTimeout(() => setIsLoading(false), 500); // Delay to allow for transition
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleFetchData();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 relative">
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 bg-white bg-opacity-80"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-16 h-16 text-indigo-600" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="max-w-7xl mx-auto h-full flex flex-col">
        <AnimatePresence>
          {!hasSearched && (
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="flex flex-col items-center justify-center h-screen"
            >
              <h1 className="text-4xl font-bold text-indigo-600 mb-4">
                Protein Explorer
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Search for proteins by Gene Symbol or UniProt ID
              </p>
              <div className="w-full max-w-md">
                <Input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter Gene Symbol or UniProt ID"
                  className="w-full mb-4"
                />
                <Button
                  onClick={handleFetchData}
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors duration-200"
                >
                  {loading ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {hasSearched && (
          <>
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full mb-4 md:mb-0 md:absolute md:top-2 md:right-8 md:w-auto z-50"
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="p-2 w-full h-full flex items-center justify-center hover:bg-indigo-50 transition-colors duration-200"
                  >
                    <Search className="text-indigo-600 h-8 w-8" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="flex flex-col space-y-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter Gene Symbol or UniProt ID"
                      className="w-full"
                    />
                    <Button
                      onClick={handleFetchData}
                      disabled={loading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors duration-200"
                    >
                      {loading ? (
                        <span className="animate-pulse">...</span>
                      ) : (
                        "Search"
                      )}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full mt-4 text-center"
              >
                <p className="text-red-500">{error}</p>
              </motion.div>
            )}

            <AnimatePresence>
              {proteinData ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 md:gap-8"
                >
                  {/* Column 1 */}
                  <div className="flex flex-col space-y-4 md:space-y-8">
                    {/* Structure Viewer */}
                    <Card className="flex-grow shadow-md overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-2xl font-semibold text-indigo-600 flex justify-between items-center">
                          <span>Structure</span>
                          <Dialog
                            open={isDialogOpen}
                            onOpenChange={setIsDialogOpen}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                className="rounded-full"
                              >
                                {selectedStructureID}{" "}
                                <ChevronDown className="ml-2 h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl w-full">
                              {" "}
                              <DialogHeader>
                                <DialogTitle>Select a Structure</DialogTitle>
                                <DialogDescription>
                                  Choose from the available structures below.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="max-h-[60vh] overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {availableStructures.map(({ summary }) => (
                                  <Card
                                    key={summary.model_identifier}
                                    className="border-indigo-200 mt-2"
                                  >
                                    <CardHeader>
                                      <CardTitle className="text-lg font-semibold">
                                        ID: {summary.model_identifier}
                                      </CardTitle>
                                      <CardDescription>
                                        {summary.model_category}
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                      <p className="text-sm">
                                        Method: {summary.experimental_method}
                                      </p>
                                      <p className="text-sm">
                                        Resolution: {summary.resolution}
                                      </p>
                                    </CardContent>
                                    <CardFooter className="flex justify-between items-center">
                                      <Button
                                        onClick={() =>
                                          handleModelClick(summary.model_url)
                                        }
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                      >
                                        Select
                                      </Button>
                                      <a
                                        href={summary.model_page_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 hover:text-indigo-800 flex items-center"
                                      >
                                        Model Page{" "}
                                        <ExternalLink className="ml-1 h-4 w-4" />
                                      </a>
                                    </CardFooter>
                                  </Card>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[400px] md:h-[calc(60vh-4rem)]">
                        <div className="relative w-full h-full">
                          <ProteinViewer dataUrl={selectedStructureURL} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Protein Complex (moved from Column 2) */}
                    <Card className="shadow-md overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-2xl font-semibold text-indigo-600">
                          Protein Complex
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[200px] md:h-[calc(40vh-8rem)]">
                        <ScrollArea className="h-full pr-4">
                          {proteinData?.comments
                            ?.filter((c: any) => c.commentType === "SUBUNIT")
                            .map((comment: any, index: number) => (
                              <div
                                key={index}
                                className="mb-4 pb-4 border-b border-indigo-100 last:border-b-0"
                              >
                                <p
                                  dangerouslySetInnerHTML={{
                                    __html: renderLinks(comment.texts[0].value),
                                  }}
                                />
                              </div>
                            )) || (
                            <p className="text-gray-500 italic">
                              No interaction data available
                            </p>
                          )}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Column 2 */}
                  <div className="flex flex-col space-y-4 md:space-y-8">
                    {/* Protein Description (moved from Column 1) */}
                    <Card className="flex-grow shadow-md overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-2xl font-semibold text-indigo-600">
                          Protein Description
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[300px] md:h-[calc(50vh-6rem)]">
                        <ScrollArea className="h-full pr-4">
                          <h3 className="text-lg font-semibold text-indigo-700 mb-2">
                            {
                              proteinData?.proteinDescription?.recommendedName
                                ?.fullName?.value
                            }
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium text-indigo-600 mb-1">
                                Function:
                              </h4>
                              <p
                                dangerouslySetInnerHTML={{
                                  __html: renderLinks(
                                    proteinData?.comments?.find(
                                      (c: any) => c.commentType === "FUNCTION"
                                    )?.texts[0]?.value ||
                                      "No function data available"
                                  ),
                                }}
                              />
                            </div>
                            <div>
                              <h4 className="font-medium text-indigo-600 mb-1">
                                Sequence Length:
                              </h4>
                              <p>
                                {proteinData?.sequence?.length ||
                                  "No sequence data available"}
                              </p>
                            </div>
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    {/* Recent Research */}
                    <Card className="flex-grow shadow-md overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-2xl font-semibold text-indigo-600">
                          Recent Research
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[300px] md:h-[calc(50vh-6rem)]">
                        <ScrollArea className="h-full pr-4">
                          {proteinData?.references
                            ?.sort(
                              (a: any, b: any) =>
                                new Date(b.citation.publicationDate).getTime() -
                                new Date(a.citation.publicationDate).getTime()
                            )
                            .slice(0, 15)
                            .map((ref: any, index: number) => (
                              <div key={index} className="mb-4">
                                <p>
                                  <strong className="text-indigo-600">
                                    {ref.citation.title}
                                  </strong>
                                </p>
                                <p className="text-sm text-gray-600">
                                  {ref.citation.authors?.join(", ")} (
                                  {ref.citation.publicationDate})
                                </p>
                                {ref.citation.citationCrossReferences?.map(
                                  (crossRef: any, crossRefIndex: number) =>
                                    crossRef.database === "PubMed" && (
                                      <a
                                        key={crossRefIndex}
                                        href={`https://pubmed.ncbi.nlm.nih.gov/${crossRef.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 hover:text-indigo-800 mr-2"
                                      >
                                        PubMed: {crossRef.id}
                                        <ExternalLink className="inline-block ml-1 h-3 w-3" />
                                      </a>
                                    )
                                )}
                              </div>
                            )) || "No recent research data available"}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8"
                >
                  {/* Wireframe placeholders */}
                  <div className="flex flex-col space-y-4 md:space-y-8">
                    <motion.div
                      className="h-[400px] md:h-[calc(60vh-4rem)] bg-gray-200 rounded-lg"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                      className="h-[200px] md:h-[calc(40vh-8rem)] bg-gray-200 rounded-lg"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: 0.2,
                      }}
                    />
                  </div>
                  <div className="flex flex-col space-y-4 md:space-y-8">
                    <motion.div
                      className="h-[300px] md:h-[calc(50vh-6rem)] bg-gray-200 rounded-lg"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: 0.4,
                      }}
                    />
                    <motion.div
                      className="h-[300px] md:h-[calc(50vh-6rem)] bg-gray-200 rounded-lg"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: 0.6,
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
