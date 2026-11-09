using Turing, DynamicPPL, Random, Test
using AbstractMCMC: SamplingOutput
if get(ENV,"PARTICLE_PORT","false")=="true"
    @eval Turing.Inference begin
        function DynamicPPL.accumulate_observe!!(vi::DynamicPPL.VarInfo,right,left,vn,template)
            vi=DynamicPPL.map_accumulators!!(acc->DynamicPPL.accumulate_observe!!(acc,right,left,vn,template),vi)
            is_particle_varinfo(vi) && (Libtask.get_taped_globals(Particle).varinfo=vi)
            return vi
        end
    end
end
@model function simple(y)
    x~Normal()
    y~Normal(x,1)
    saved:=2x
    return x
end
@testset "particle metadata" begin
    for spl in (SMC(),PG(5))
        out=sample(Xoshiro(14),simple(2.0),spl,10;progress=false,verbose=false,chain_type=SamplingOutput)
        for d in out.samples
            x=d.params[@varname(x)]
            @test d.stats.loglikelihood≈logpdf(Normal(x,1),2.0)
            @test d.stats.logjoint≈logpdf(Normal(),x)+logpdf(Normal(x,1),2.0)
            @test d.params[@varname(saved)]==2x
        end
    end
end
